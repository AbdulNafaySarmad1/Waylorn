//! Bounded, read-only Modbus TCP observation for an explicitly declared device.
//! Each read uses one connection and one transaction; no write function is exposed.

use std::io::{self, Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::sync::atomic::{AtomicU16, Ordering};
use std::time::{Duration, Instant};

use crate::{DiscoveredDevice, GateDecision, Operation, evaluate};

static NEXT_TRANSACTION_ID: AtomicU16 = AtomicU16::new(1);

#[derive(Debug)]
pub enum ReadError {
    Denied(GateDecision),
    InvalidRange,
    Io(io::Error),
    MalformedResponse,
    DeviceException(u8),
}

impl From<io::Error> for ReadError {
    fn from(value: io::Error) -> Self {
        Self::Io(value)
    }
}

#[derive(Clone, Copy, Debug)]
pub enum RegisterKind {
    Holding,
    Input,
}

impl RegisterKind {
    const fn function(self) -> u8 {
        match self {
            Self::Holding => 0x03,
            Self::Input => 0x04,
        }
    }
}

pub struct ModbusTcpReader {
    address: SocketAddr,
    unit_id: u8,
    timeout: Duration,
}

impl ModbusTcpReader {
    pub fn new(address: SocketAddr, unit_id: u8, timeout: Duration) -> Result<Self, ReadError> {
        if timeout.is_zero() || timeout > Duration::from_secs(10) {
            return Err(ReadError::InvalidRange);
        }
        Ok(Self {
            address,
            unit_id,
            timeout,
        })
    }

    pub fn read_registers(
        &self,
        device: &DiscoveredDevice,
        kind: RegisterKind,
        start: u16,
        count: u16,
    ) -> Result<Vec<u16>, ReadError> {
        let decision = evaluate(device, Operation::Read);
        if decision != GateDecision::AllowObservation {
            return Err(ReadError::Denied(decision));
        }
        if !(1..=125).contains(&count) || start.checked_add(count - 1).is_none() {
            return Err(ReadError::InvalidRange);
        }

        let transaction_id = NEXT_TRANSACTION_ID.fetch_add(1, Ordering::Relaxed);
        let mut request = [0_u8; 12];
        request[0..2].copy_from_slice(&transaction_id.to_be_bytes());
        request[4..6].copy_from_slice(&6_u16.to_be_bytes());
        request[6] = self.unit_id;
        request[7] = kind.function();
        request[8..10].copy_from_slice(&start.to_be_bytes());
        request[10..12].copy_from_slice(&count.to_be_bytes());

        let deadline = Instant::now() + self.timeout;
        let mut stream = TcpStream::connect_timeout(&self.address, remaining(deadline)?)?;
        write_bounded(&mut stream, &request, deadline)?;

        let mut header = [0_u8; 7];
        read_bounded(&mut stream, &mut header, deadline)?;
        let response_id = u16::from_be_bytes([header[0], header[1]]);
        let protocol = u16::from_be_bytes([header[2], header[3]]);
        let length = u16::from_be_bytes([header[4], header[5]]) as usize;
        if response_id != transaction_id
            || protocol != 0
            || header[6] != self.unit_id
            || !(2..=253).contains(&length)
        {
            return Err(ReadError::MalformedResponse);
        }
        let mut pdu = vec![0_u8; length - 1];
        read_bounded(&mut stream, &mut pdu, deadline)?;
        if pdu.len() == 2 && pdu[0] == (kind.function() | 0x80) {
            return Err(ReadError::DeviceException(pdu[1]));
        }
        if pdu.len() != 2 + 2 * count as usize
            || pdu[0] != kind.function()
            || pdu[1] as usize != 2 * count as usize
        {
            return Err(ReadError::MalformedResponse);
        }
        Ok(pdu[2..]
            .chunks_exact(2)
            .map(|bytes| u16::from_be_bytes([bytes[0], bytes[1]]))
            .collect())
    }
}

fn remaining(deadline: Instant) -> io::Result<Duration> {
    let left = deadline.saturating_duration_since(Instant::now());
    if left.is_zero() {
        Err(io::Error::new(
            io::ErrorKind::TimedOut,
            "Modbus read deadline elapsed",
        ))
    } else {
        Ok(left)
    }
}

fn write_bounded(stream: &mut TcpStream, mut data: &[u8], deadline: Instant) -> io::Result<()> {
    while !data.is_empty() {
        stream.set_write_timeout(Some(remaining(deadline)?))?;
        let n = stream.write(data)?;
        if n == 0 {
            return Err(io::Error::new(
                io::ErrorKind::WriteZero,
                "Modbus socket closed",
            ));
        }
        data = &data[n..];
    }
    Ok(())
}

fn read_bounded(stream: &mut TcpStream, mut data: &mut [u8], deadline: Instant) -> io::Result<()> {
    while !data.is_empty() {
        stream.set_read_timeout(Some(remaining(deadline)?))?;
        let n = stream.read(data)?;
        if n == 0 {
            return Err(io::Error::new(
                io::ErrorKind::UnexpectedEof,
                "Modbus socket closed",
            ));
        }
        data = &mut data[n..];
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;
    use std::net::TcpListener;
    use std::thread;

    fn allowed_device() -> DiscoveredDevice {
        DiscoveredDevice {
            id: "simulator".into(),
            identified: true,
            declared_operations: BTreeSet::from([Operation::Read]),
        }
    }

    fn simulate(
        response: impl FnOnce([u8; 12]) -> Vec<u8> + Send + 'static,
    ) -> (SocketAddr, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let handle = thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut request = [0_u8; 12];
            socket.read_exact(&mut request).unwrap();
            socket.write_all(&response(request)).unwrap();
        });
        (address, handle)
    }

    fn reader(address: SocketAddr) -> ModbusTcpReader {
        ModbusTcpReader::new(address, 1, Duration::from_secs(1)).unwrap()
    }

    #[test]
    fn reads_registers_from_local_simulator() {
        let (address, server) = simulate(|request| {
            assert_eq!(&request[2..6], &[0, 0, 0, 6]);
            assert_eq!(&request[6..], &[1, 3, 0, 10, 0, 2]);
            let mut response = request[..2].to_vec();
            response.extend_from_slice(&[0, 0, 0, 7, 1, 3, 4, 0x12, 0x34, 0, 2]);
            response
        });
        assert_eq!(
            reader(address)
                .read_registers(&allowed_device(), RegisterKind::Holding, 10, 2)
                .unwrap(),
            vec![0x1234, 2]
        );
        server.join().unwrap();
    }

    #[test]
    fn denies_unknown_device_before_opening_a_socket() {
        let address = "127.0.0.1:1".parse().unwrap();
        assert!(matches!(
            reader(address).read_registers(
                &DiscoveredDevice::unknown("unknown"),
                RegisterKind::Input,
                0,
                1
            ),
            Err(ReadError::Denied(GateDecision::DenyUndeclaredOperation))
        ));
    }

    #[test]
    fn rejects_malformed_transaction_id() {
        let (address, server) = simulate(|request| {
            let mut response = request[..2].to_vec();
            response[0] ^= 0x01;
            response.extend_from_slice(&[0, 0, 0, 5, 1, 3, 2, 0, 1]);
            response
        });
        assert!(matches!(
            reader(address).read_registers(&allowed_device(), RegisterKind::Holding, 0, 1),
            Err(ReadError::MalformedResponse)
        ));
        server.join().unwrap();
    }

    #[test]
    fn reports_device_exception_without_retrying() {
        let (address, server) = simulate(|request| {
            let mut response = request[..2].to_vec();
            response.extend_from_slice(&[0, 0, 0, 3, 1, 0x83, 2]);
            response
        });
        assert!(matches!(
            reader(address).read_registers(&allowed_device(), RegisterKind::Holding, 0, 1),
            Err(ReadError::DeviceException(2))
        ));
        server.join().unwrap();
    }

    #[test]
    fn rejects_oversized_response_before_allocation() {
        let (address, server) = simulate(|request| {
            let mut response = request[..2].to_vec();
            response.extend_from_slice(&[0, 0, 1, 0, 1]);
            response
        });
        assert!(matches!(
            reader(address).read_registers(&allowed_device(), RegisterKind::Holding, 0, 1),
            Err(ReadError::MalformedResponse)
        ));
        server.join().unwrap();
    }
}

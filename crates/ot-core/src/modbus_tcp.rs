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

const MEI_FUNCTION: u8 = 0x2B;
const READ_DEVICE_ID: u8 = 0x0E;
const BASIC_STREAM: u8 = 0x01;

#[derive(Debug, PartialEq)]
pub struct DeviceIdentity {
    pub vendor_name: String,
    pub product_code: String,
    pub revision: String,
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
        let mut request = vec![kind.function()];
        request.extend_from_slice(&start.to_be_bytes());
        request.extend_from_slice(&count.to_be_bytes());
        let pdu = self.transact(&request)?;
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

    /// Read Device Identification (function 0x2B, MEI 0x0E), basic stream: the three mandatory
    /// objects. The result is a claim about the configured endpoint, not a verified asset identity.
    pub fn identify(&self, device: &DiscoveredDevice) -> Result<DeviceIdentity, ReadError> {
        let decision = evaluate(device, Operation::Identify);
        if decision != GateDecision::AllowObservation {
            return Err(ReadError::Denied(decision));
        }
        let pdu = self.transact(&[MEI_FUNCTION, READ_DEVICE_ID, BASIC_STREAM, 0])?;
        // ponytail: single response only; basic objects fit one PDU, add continuation if a device sets more-follows.
        if pdu.len() < 7 || pdu[..3] != [MEI_FUNCTION, READ_DEVICE_ID, BASIC_STREAM] || pdu[4] != 0 {
            return Err(ReadError::MalformedResponse);
        }
        let mut objects: [Option<String>; 3] = [None, None, None];
        let mut rest = &pdu[7..];
        for _ in 0..pdu[6] {
            let [id, len, tail @ ..] = rest else { return Err(ReadError::MalformedResponse) };
            let len = *len as usize;
            if tail.len() < len || !(1..=64).contains(&len) {
                return Err(ReadError::MalformedResponse);
            }
            let text = &tail[..len];
            // Printable ASCII without quote or backslash, so the value can be passed on verbatim.
            if !text.iter().all(|b| (0x20..0x7f).contains(b) && *b != b'"' && *b != b'\\') {
                return Err(ReadError::MalformedResponse);
            }
            if let Some(slot) = objects.get_mut(*id as usize) {
                if slot.is_some() {
                    return Err(ReadError::MalformedResponse);
                }
                *slot = Some(String::from_utf8_lossy(text).into_owned());
            }
            rest = &tail[len..];
        }
        match objects {
            [Some(vendor_name), Some(product_code), Some(revision)] if rest.is_empty() => Ok(DeviceIdentity {
                vendor_name,
                product_code,
                revision,
            }),
            _ => Err(ReadError::MalformedResponse),
        }
    }

    /// One bounded request/response on a fresh connection. Returns the response PDU, or the device's
    /// exception code when it answers with the request function's exception form.
    fn transact(&self, request: &[u8]) -> Result<Vec<u8>, ReadError> {
        let transaction_id = NEXT_TRANSACTION_ID.fetch_add(1, Ordering::Relaxed);
        let mut frame = transaction_id.to_be_bytes().to_vec();
        frame.extend_from_slice(&[0, 0]);
        frame.extend_from_slice(&(request.len() as u16 + 1).to_be_bytes());
        frame.push(self.unit_id);
        frame.extend_from_slice(request);

        let deadline = Instant::now() + self.timeout;
        let mut stream = TcpStream::connect_timeout(&self.address, remaining(deadline)?)?;
        write_bounded(&mut stream, &frame, deadline)?;

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
        if pdu.len() == 2 && pdu[0] == (request[0] | 0x80) {
            return Err(ReadError::DeviceException(pdu[1]));
        }
        Ok(pdu)
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
        response: impl FnOnce(Vec<u8>) -> Vec<u8> + Send + 'static,
    ) -> (SocketAddr, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let handle = thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut request = vec![0_u8; 7];
            socket.read_exact(&mut request).unwrap();
            let length = u16::from_be_bytes([request[4], request[5]]) as usize;
            request.resize(6 + length, 0);
            socket.read_exact(&mut request[7..]).unwrap();
            socket.write_all(&response(request)).unwrap();
        });
        (address, handle)
    }

    fn identified_device() -> DiscoveredDevice {
        DiscoveredDevice {
            id: "simulator".into(),
            identified: true,
            declared_operations: BTreeSet::from([Operation::Identify]),
        }
    }

    fn identity_response(request: &[u8], more_follows: u8, objects: &[(u8, &[u8])]) -> Vec<u8> {
        let mut pdu = vec![0x2B, 0x0E, 0x01, 0x01, more_follows, 0, objects.len() as u8];
        for (id, value) in objects {
            pdu.extend_from_slice(&[*id, value.len() as u8]);
            pdu.extend_from_slice(value);
        }
        let mut response = request[..2].to_vec();
        response.extend_from_slice(&[0, 0]);
        response.extend_from_slice(&(pdu.len() as u16 + 1).to_be_bytes());
        response.push(request[6]);
        response.extend_from_slice(&pdu);
        response
    }

    #[test]
    fn identifies_basic_device_objects() {
        let (address, server) = simulate(|request| {
            assert_eq!(&request[2..], &[0, 0, 0, 5, 1, 0x2B, 0x0E, 0x01, 0x00]);
            identity_response(&request, 0, &[(0, b"Acme"), (1, b"PLC-42"), (2, b"1.20")])
        });
        assert_eq!(
            reader(address).identify(&identified_device()).unwrap(),
            DeviceIdentity {
                vendor_name: "Acme".into(),
                product_code: "PLC-42".into(),
                revision: "1.20".into()
            }
        );
        server.join().unwrap();
    }

    #[test]
    fn identification_requires_declared_operation() {
        assert!(matches!(
            reader("127.0.0.1:1".parse().unwrap()).identify(&allowed_device()),
            Err(ReadError::Denied(GateDecision::DenyUndeclaredOperation))
        ));
    }

    #[test]
    fn rejects_incomplete_continued_or_unsafe_identity() {
        for objects in [
            (0_u8, vec![(0_u8, &b"Acme"[..]), (1, &b"PLC-42"[..])]),
            (0xFF, vec![(0, &b"Acme"[..]), (1, &b"PLC-42"[..]), (2, &b"1.20"[..])]),
            (0, vec![(0, &b"Ac\"me"[..]), (1, &b"PLC-42"[..]), (2, &b"1.20"[..])]),
            (0, vec![(0, &b"Acme"[..]), (0, &b"Acme"[..]), (1, &b"PLC-42"[..]), (2, &b"1.20"[..])]),
        ] {
            let (more, list) = objects;
            let (address, server) = simulate(move |request| identity_response(&request, more, &list));
            assert!(matches!(
                reader(address).identify(&identified_device()),
                Err(ReadError::MalformedResponse)
            ));
            server.join().unwrap();
        }
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

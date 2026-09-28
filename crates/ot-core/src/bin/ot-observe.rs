//! One bounded read or identification from an explicitly configured Modbus TCP endpoint.
//! Stdout is a versioned result for the local Go site gateway; no writes exist.

use std::collections::BTreeSet;
use std::env;
use std::net::SocketAddr;
use std::process::ExitCode;
use std::time::Duration;
use waylorn_ot_core::modbus_tcp::{ModbusTcpReader, RegisterKind};
use waylorn_ot_core::{DiscoveredDevice, Operation};

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(reason) => {
            eprintln!("{reason}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<(), String> {
    let args: Vec<String> = env::args().collect();
    if args.len() == 4 && args[1] == "identify" {
        return identify(&args[2], &args[3]);
    }
    if args.len() != 6 {
        return Err("usage: ot-observe <numeric-ip:port> <unit-id> <holding|input> <start> <count>
       ot-observe identify <numeric-ip:port> <unit-id>".into());
    }
    let address: SocketAddr = args[1].parse().map_err(|_| "endpoint must be a numeric IP and port")?;
    let unit_id: u8 = args[2].parse().map_err(|_| "invalid Modbus unit ID")?;
    let kind = match args[3].as_str() {
        "holding" => RegisterKind::Holding,
        "input" => RegisterKind::Input,
        _ => return Err("register kind must be holding or input".into()),
    };
    let start: u16 = args[4].parse().map_err(|_| "invalid start address")?;
    let count: u16 = args[5].parse().map_err(|_| "invalid register count")?;
    let mut device = DiscoveredDevice::unknown(address.to_string());
    device.identified = true;
    device.declared_operations = BTreeSet::from([Operation::Read]);
    let reader = ModbusTcpReader::new(address, unit_id, Duration::from_secs(5))
        .map_err(|err| format!("reader configuration rejected: {err:?}"))?;
    let values = reader.read_registers(&device, kind, start, count)
        .map_err(|err| format!("Modbus observation failed: {err:?}"))?;
    print!("{{\"schemaVersion\":1,\"values\":[");
    for (index, value) in values.iter().enumerate() {
        if index > 0 { print!(","); }
        print!("{value}");
    }
    println!("]}}");
    Ok(())
}

/// Device identification is a claim for the control plane to reconcile; it grants nothing.
fn identify(endpoint: &str, unit: &str) -> Result<(), String> {
    let address: SocketAddr = endpoint.parse().map_err(|_| "endpoint must be a numeric IP and port")?;
    let unit_id: u8 = unit.parse().map_err(|_| "invalid Modbus unit ID")?;
    let mut device = DiscoveredDevice::unknown(address.to_string());
    device.declared_operations = BTreeSet::from([Operation::Identify]);
    let reader = ModbusTcpReader::new(address, unit_id, Duration::from_secs(5))
        .map_err(|err| format!("reader configuration rejected: {err:?}"))?;
    let identity = reader.identify(&device)
        .map_err(|err| format!("Modbus identification failed: {err:?}"))?;
    // The reader admits only printable ASCII without quotes or backslashes, so no escaping is needed.
    println!(
        "{{\"schemaVersion\":1,\"vendorName\":\"{}\",\"productCode\":\"{}\",\"revision\":\"{}\"}}",
        identity.vendor_name, identity.product_code, identity.revision
    );
    Ok(())
}

//! Offline OT operation gate. This crate performs no device I/O and is not an
//! authorization service. It is a first fail-closed check for future adapters.

use std::collections::BTreeSet;

/// Operations have fixed risk classes; an adapter cannot downgrade a write.
/// Numeric values match src/contracts/ot/v1/ot.proto and the .NET domain.
#[repr(i32)]
#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum Operation {
    Discover = 1,
    Identify = 2,
    Read = 3,
    Subscribe = 4,
    Health = 5,
    ReadConfiguration = 6,
    ChangeConfiguration = 7,
    Write = 8,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Risk {
    Green,
    Amber,
    Red,
}

impl Operation {
    pub const fn risk(self) -> Risk {
        match self {
            Self::Discover
            | Self::Identify
            | Self::Read
            | Self::Subscribe
            | Self::Health
            | Self::ReadConfiguration => Risk::Green,
            Self::ChangeConfiguration => Risk::Amber,
            Self::Write => Risk::Red,
        }
    }
}

/// Adapter-reported operations are claims, not authorization grants.
#[derive(Debug)]
pub struct DiscoveredDevice {
    pub id: String,
    pub identified: bool,
    pub declared_operations: BTreeSet<Operation>,
}

impl DiscoveredDevice {
    pub fn unknown(id: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            identified: false,
            declared_operations: BTreeSet::new(),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GateDecision {
    AllowObservation,
    DenyConsequentialOperation,
    DenyUndeclaredOperation,
}

/// Only declared observation is eligible. This is deliberately stricter than
/// a full command policy until identity, approvals, durable audit and a local
/// safety gate are implemented and verified.
pub fn evaluate(device: &DiscoveredDevice, operation: Operation) -> GateDecision {
    if operation.risk() != Risk::Green {
        return GateDecision::DenyConsequentialOperation;
    }
    if !device.declared_operations.contains(&operation) {
        return GateDecision::DenyUndeclaredOperation;
    }
    GateDecision::AllowObservation
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unknown_device_has_no_implicit_capabilities() {
        let device = DiscoveredDevice::unknown("device-1");
        assert_eq!(
            evaluate(&device, Operation::Read),
            GateDecision::DenyUndeclaredOperation
        );
        assert_eq!(
            evaluate(&device, Operation::Write),
            GateDecision::DenyConsequentialOperation
        );
    }

    #[test]
    fn advertised_observation_is_eligible() {
        let mut device = DiscoveredDevice::unknown("device-1");
        device.declared_operations.insert(Operation::Read);
        assert_eq!(
            evaluate(&device, Operation::Read),
            GateDecision::AllowObservation
        );
        assert_eq!(
            evaluate(&device, Operation::Subscribe),
            GateDecision::DenyUndeclaredOperation
        );
    }

    #[test]
    fn consequential_operations_stay_denied_even_when_advertised_and_identified() {
        let mut device = DiscoveredDevice::unknown("device-1");
        device.identified = true;
        device
            .declared_operations
            .extend([Operation::ChangeConfiguration, Operation::Write]);
        assert_eq!(
            evaluate(&device, Operation::ChangeConfiguration),
            GateDecision::DenyConsequentialOperation
        );
        assert_eq!(
            evaluate(&device, Operation::Write),
            GateDecision::DenyConsequentialOperation
        );
    }

    #[test]
    fn risk_classes_cannot_be_adapter_supplied() {
        assert_eq!(Operation::ReadConfiguration.risk(), Risk::Green);
        assert_eq!(Operation::ChangeConfiguration.risk(), Risk::Amber);
        assert_eq!(Operation::Write.risk(), Risk::Red);
    }

    #[test]
    fn operation_codes_match_v1_contract() {
        assert_eq!(Operation::Read as i32, 3);
        assert_eq!(Operation::ChangeConfiguration as i32, 7);
        assert_eq!(Operation::Write as i32, 8);
    }
}

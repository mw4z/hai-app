import Foundation
import Capacitor
import ContactsUI

/// Native iOS contact picker for Hai.
///
/// Uses CNContactPickerViewController — the privacy-preserving system
/// picker that only returns the data the user explicitly selects. Does
/// NOT require NSContactsUsageDescription.
///
/// The picker is configured with `displayedPropertyKeys = [phoneNumbers]`
/// so the user drills into a contact and taps a SPECIFIC phone number.
/// The `didSelect contactProperty:` delegate receives that number
/// directly — no refetch via CNContactStore needed (which would require
/// full contacts permission).
///
/// Registered via CAPBridgedPlugin (pure Swift, no ObjC .m file) so
/// it compiles cleanly under SPM.
@objc(HaiContactsPlugin)
public class HaiContactsPlugin: CAPPlugin, CAPBridgedPlugin, CNContactPickerDelegate {

    public let identifier = "HaiContactsPlugin"
    public let jsName = "HaiContacts"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pickContact", returnType: CAPPluginReturnPromise)
    ]

    private var savedCallbackId: String?

    // MARK: - JS-callable method

    @objc func pickContact(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.bridge?.saveCall(call)
            self.savedCallbackId = call.callbackId

            let picker = CNContactPickerViewController()
            picker.delegate = self
            // Show phone numbers so the user picks a specific number.
            // Without this, the returned CNContact has phoneNumbers empty
            // because CNContactPickerViewController only fetches "default"
            // properties and phoneNumbers is NOT one of them.
            picker.displayedPropertyKeys = [CNContactPhoneNumbersKey]
            self.bridge?.viewController?.present(picker, animated: true)
        }
    }

    // MARK: - CNContactPickerDelegate

    /// Called when the user taps a specific phone number inside a contact.
    /// This is the primary delegate we use — gives us both the contact
    /// info AND the selected phone number without needing CNContactStore.
    public func contactPicker(
        _ picker: CNContactPickerViewController,
        didSelect contactProperty: CNContactProperty
    ) {
        guard let callId = savedCallbackId,
              let call = bridge?.savedCall(withID: callId) else { return }

        let contact = contactProperty.contact
        let given = contact.givenName
        let family = contact.familyName
        let display = "\(given) \(family)"
            .trimmingCharacters(in: .whitespaces)

        // The selected phone number
        let selectedPhone = (contactProperty.value as? CNPhoneNumber)?.stringValue ?? ""

        // Also include all phone numbers from the contact for completeness
        let phones: [[String: String]]
        if !selectedPhone.isEmpty {
            phones = [["number": selectedPhone]]
        } else {
            phones = contact.phoneNumbers.map {
                ["number": $0.value.stringValue]
            }
        }

        call.resolve([
            "contact": [
                "name": [
                    "display": display,
                    "given": given,
                    "family": family
                ],
                "phones": phones
            ]
        ])

        savedCallbackId = nil
        bridge?.releaseCall(call)
    }

    /// Fallback: called if the user somehow selects a whole contact
    /// (shouldn't happen with displayedPropertyKeys set, but safety net).
    public func contactPicker(
        _ picker: CNContactPickerViewController,
        didSelect contact: CNContact
    ) {
        guard let callId = savedCallbackId,
              let call = bridge?.savedCall(withID: callId) else { return }

        let given = contact.givenName
        let family = contact.familyName
        let display = "\(given) \(family)"
            .trimmingCharacters(in: .whitespaces)

        let phones: [[String: String]] = contact.phoneNumbers.map {
            ["number": $0.value.stringValue]
        }

        call.resolve([
            "contact": [
                "name": [
                    "display": display,
                    "given": given,
                    "family": family
                ],
                "phones": phones
            ]
        ])

        savedCallbackId = nil
        bridge?.releaseCall(call)
    }

    public func contactPickerDidCancel(
        _ picker: CNContactPickerViewController
    ) {
        guard let callId = savedCallbackId,
              let call = bridge?.savedCall(withID: callId) else { return }

        call.resolve(["contact": NSNull()])
        savedCallbackId = nil
        bridge?.releaseCall(call)
    }
}

import Foundation
import Capacitor
import ContactsUI

/// Native iOS contact picker for Hai.
///
/// Uses CNContactPickerViewController — the privacy-preserving system
/// picker that only returns the single contact the user explicitly
/// selects. Does NOT require NSContactsUsageDescription (no blanket
/// contacts access is granted).
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
            self.bridge?.viewController?.present(picker, animated: true)
        }
    }

    // MARK: - CNContactPickerDelegate

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

        // Return nil contact so the JS side knows the user cancelled.
        call.resolve(["contact": NSNull()])
        savedCallbackId = nil
        bridge?.releaseCall(call)
    }
}

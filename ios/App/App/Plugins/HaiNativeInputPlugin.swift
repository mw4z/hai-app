import Capacitor
import Foundation
import UIKit

/// HaiNativeInput — overlays a native UITextView on top of the
/// WKWebView at a JS-supplied rect, so the iOS keyboard renders the
/// same modern white style native apps (WhatsApp, Notes, Messages)
/// get instead of the gray-substrate WKWebView keyboard.
///
/// Lifecycle
///   create({ id, rect, value, multiline, secure, rtl, placeholder })
///     → Creates a UITextView positioned absolutely over the WebView.
///       Stored by id so subsequent calls can address it.
///   focus({ id })       → makeFirstResponder + raises the keyboard.
///   blur({ id })        → resignFirstResponder.
///   setValue({ id, value }) → JS-driven update (e.g., clear-on-send).
///   setRect({ id, rect }) → reposition (scroll, resize, keyboard show).
///   destroy({ id })     → remove from view hierarchy + map.
///
/// Events emitted to JS
///   change   { id, value }     — every keystroke / paste / cut.
///   submit   { id }            — return key on a single-line input.
///   focus    { id }            — became first responder.
///   blur     { id }            — resigned.
///
/// Per iOS spec the swizzle done by @capacitor/keyboard does NOT
/// affect native UITextView/UITextField; iOS gives them the modern
/// keyboard automatically.
@objc(HaiNativeInputPlugin)
public class HaiNativeInputPlugin: CAPPlugin {
  // id → live native field. The dictionary is the source of truth
  // for "is this overlay alive?".
  private var fields: [String: HaiNativeField] = [:]

  // MARK: create
  @objc func create(_ call: CAPPluginCall) {
    guard let id = call.getString("id") else {
      call.reject("missing id"); return
    }
    let rect = parseRect(call.getObject("rect"))
    let value = call.getString("value") ?? ""
    let multiline = call.getBool("multiline", true)
    let secure = call.getBool("secure", false)
    let rtl = call.getBool("rtl", false)
    let placeholder = call.getString("placeholder")
    let returnKey = call.getString("returnKey", "default")
    let keyboardType = call.getString("keyboardType", "default")
    let autocapitalize = call.getString("autocapitalize", "sentences")
    let autocorrect = call.getBool("autocorrect", true)
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      // Replace any existing field with the same id.
      if let existing = self.fields[id] {
        existing.removeFromSuperview()
      }
      guard let webView = self.bridge?.webView else {
        call.reject("no webview"); return
      }
      let field = HaiNativeField(
        id: id,
        multiline: multiline,
        secure: secure,
        rtl: rtl,
        plugin: self
      )
      field.frame = rect
      field.applyText(value)
      field.applyPlaceholder(placeholder)
      field.applyReturnKey(returnKey)
      field.applyKeyboardType(keyboardType)
      field.applyAutocapitalize(autocapitalize)
      field.applyAutocorrect(autocorrect)
      webView.addSubview(field)
      self.fields[id] = field
      call.resolve()
    }
  }

  // MARK: focus / blur
  @objc func focus(_ call: CAPPluginCall) {
    guard let id = call.getString("id") else { call.reject("missing id"); return }
    DispatchQueue.main.async {
      self.fields[id]?.becomeFirst()
      call.resolve()
    }
  }
  @objc func blur(_ call: CAPPluginCall) {
    guard let id = call.getString("id") else { call.reject("missing id"); return }
    DispatchQueue.main.async {
      self.fields[id]?.resignFirst()
      call.resolve()
    }
  }

  // MARK: setValue / setRect
  @objc func setValue(_ call: CAPPluginCall) {
    guard let id = call.getString("id") else { call.reject("missing id"); return }
    let value = call.getString("value") ?? ""
    DispatchQueue.main.async {
      self.fields[id]?.applyText(value)
      call.resolve()
    }
  }
  @objc func setRect(_ call: CAPPluginCall) {
    guard let id = call.getString("id") else { call.reject("missing id"); return }
    let rect = parseRect(call.getObject("rect"))
    DispatchQueue.main.async {
      self.fields[id]?.frame = rect
      call.resolve()
    }
  }

  // MARK: destroy
  @objc func destroy(_ call: CAPPluginCall) {
    guard let id = call.getString("id") else { call.reject("missing id"); return }
    DispatchQueue.main.async {
      self.fields[id]?.removeFromSuperview()
      self.fields.removeValue(forKey: id)
      call.resolve()
    }
  }

  // MARK: helpers
  private func parseRect(_ obj: [String: Any]?) -> CGRect {
    guard let obj = obj else { return .zero }
    let x = (obj["x"] as? CGFloat) ?? CGFloat(obj["x"] as? Double ?? 0)
    let y = (obj["y"] as? CGFloat) ?? CGFloat(obj["y"] as? Double ?? 0)
    let w = (obj["w"] as? CGFloat) ?? CGFloat(obj["w"] as? Double ?? 0)
    let h = (obj["h"] as? CGFloat) ?? CGFloat(obj["h"] as? Double ?? 0)
    return CGRect(x: x, y: y, width: w, height: h)
  }

  // Re-exposed to fields for event emission.
  func notify(_ event: String, _ data: [String: Any]) {
    self.notifyListeners(event, data: data)
  }
}

/// Concrete UIView wrapping either a UITextField (single-line) or
/// UITextView (multi-line) — chosen at create-time. We expose a
/// uniform API to the plugin so it doesn't care which.
final class HaiNativeField: UIView, UITextViewDelegate, UITextFieldDelegate {
  let id: String
  let multiline: Bool
  weak var plugin: HaiNativeInputPlugin?

  private let textView: UITextView?
  private let textField: UITextField?
  private let placeholderLabel: UILabel

  init(id: String, multiline: Bool, secure: Bool, rtl: Bool, plugin: HaiNativeInputPlugin) {
    self.id = id
    self.multiline = multiline
    self.plugin = plugin
    self.placeholderLabel = UILabel()
    self.placeholderLabel.textColor = .placeholderText
    self.placeholderLabel.font = UIFont.systemFont(ofSize: 16)
    self.placeholderLabel.numberOfLines = 0
    self.placeholderLabel.textAlignment = rtl ? .right : .left

    if multiline {
      let tv = UITextView()
      tv.font = UIFont.systemFont(ofSize: 16)
      tv.backgroundColor = .clear
      tv.textContainerInset = .zero
      tv.textContainer.lineFragmentPadding = 0
      tv.isSecureTextEntry = secure
      tv.textAlignment = rtl ? .right : .left
      tv.semanticContentAttribute = rtl ? .forceRightToLeft : .forceLeftToRight
      self.textView = tv
      self.textField = nil
    } else {
      let tf = UITextField()
      tf.font = UIFont.systemFont(ofSize: 16)
      tf.backgroundColor = .clear
      tf.borderStyle = .none
      tf.isSecureTextEntry = secure
      tf.textAlignment = rtl ? .right : .left
      tf.semanticContentAttribute = rtl ? .forceRightToLeft : .forceLeftToRight
      self.textView = nil
      self.textField = tf
    }
    super.init(frame: .zero)
    self.backgroundColor = .clear
    if let tv = textView {
      tv.delegate = self
      tv.frame = self.bounds
      tv.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      addSubview(tv)
    } else if let tf = textField {
      tf.delegate = self
      tf.frame = self.bounds
      tf.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      addSubview(tf)
      tf.addTarget(self, action: #selector(textFieldChanged), for: .editingChanged)
    }
    placeholderLabel.frame = self.bounds
    placeholderLabel.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    placeholderLabel.isUserInteractionEnabled = false
    addSubview(placeholderLabel)
  }
  required init?(coder: NSCoder) { fatalError("init(coder:) not used") }

  func applyText(_ s: String) {
    if let tv = textView { tv.text = s }
    else { textField?.text = s }
    updatePlaceholder()
  }
  func applyPlaceholder(_ s: String?) {
    placeholderLabel.text = s ?? ""
    updatePlaceholder()
  }
  func applyReturnKey(_ s: String) {
    let key: UIReturnKeyType
    switch s {
    case "send":   key = .send
    case "search": key = .search
    case "go":     key = .go
    case "done":   key = .done
    case "next":   key = .next
    default:       key = .default
    }
    textView?.returnKeyType = key
    textField?.returnKeyType = key
  }
  func applyKeyboardType(_ s: String) {
    let t: UIKeyboardType
    switch s {
    case "numeric":  t = .numberPad
    case "decimal":  t = .decimalPad
    case "email":    t = .emailAddress
    case "url":      t = .URL
    case "phone":    t = .phonePad
    case "search":   t = .webSearch
    default:         t = .default
    }
    textView?.keyboardType = t
    textField?.keyboardType = t
  }
  func applyAutocapitalize(_ s: String) {
    let cap: UITextAutocapitalizationType
    switch s {
    case "none":       cap = .none
    case "words":      cap = .words
    case "characters": cap = .allCharacters
    default:           cap = .sentences
    }
    textView?.autocapitalizationType = cap
    textField?.autocapitalizationType = cap
  }
  func applyAutocorrect(_ on: Bool) {
    let v: UITextAutocorrectionType = on ? .yes : .no
    textView?.autocorrectionType = v
    textField?.autocorrectionType = v
  }

  func becomeFirst() { _ = textView?.becomeFirstResponder() ?? textField?.becomeFirstResponder() }
  func resignFirst() { _ = textView?.resignFirstResponder() ?? textField?.resignFirstResponder() }

  private func currentText() -> String {
    return textView?.text ?? textField?.text ?? ""
  }
  private func updatePlaceholder() {
    placeholderLabel.isHidden = !currentText().isEmpty
  }

  // MARK: UITextViewDelegate
  func textViewDidChange(_ textView: UITextView) {
    updatePlaceholder()
    plugin?.notify("change", ["id": id, "value": textView.text ?? ""])
  }
  func textViewDidBeginEditing(_ textView: UITextView) {
    plugin?.notify("focus", ["id": id])
  }
  func textViewDidEndEditing(_ textView: UITextView) {
    plugin?.notify("blur", ["id": id])
  }

  // MARK: UITextFieldDelegate
  @objc private func textFieldChanged() {
    updatePlaceholder()
    plugin?.notify("change", ["id": id, "value": textField?.text ?? ""])
  }
  func textFieldShouldReturn(_ textField: UITextField) -> Bool {
    plugin?.notify("submit", ["id": id])
    return true
  }
  func textFieldDidBeginEditing(_ textField: UITextField) {
    plugin?.notify("focus", ["id": id])
  }
  func textFieldDidEndEditing(_ textField: UITextField) {
    plugin?.notify("blur", ["id": id])
  }
}

#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Capacitor's plugin discovery requires this Objective-C registration
// macro, even when the implementation is pure Swift. Each method that
// JS can call must be declared here.
CAP_PLUGIN(HaiNativeInputPlugin, "HaiNativeInput",
  CAP_PLUGIN_METHOD(create,   CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(focus,    CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(blur,     CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(setValue, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(setRect,  CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(destroy,  CAPPluginReturnPromise);
)

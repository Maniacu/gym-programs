# GymTracker OTA

Signed update bundles for the GymTracker Android app.

Published by `tools/publish-ota.js`. Every bundle is signed with an ECDSA P-256 key whose
public half is compiled into the APK — the phone refuses anything it cannot verify, so
this repo being public does not let anyone push code to the device.

Contains app code only. No training data: that never leaves the phone.

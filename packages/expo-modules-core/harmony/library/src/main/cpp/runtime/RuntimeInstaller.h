#pragma once

#include <memory>

#include <jsi/jsi.h>

namespace expo::harmony {

class RuntimeContext;

class RuntimeInstaller final {
public:
  static std::shared_ptr<RuntimeContext> installedContext(
      facebook::jsi::Runtime &runtime);
  static void uninstall(
      facebook::jsi::Runtime &runtime,
      const RuntimeContext *context);
  static bool install(
      facebook::jsi::Runtime &runtime,
      const std::shared_ptr<RuntimeContext> &context,
      bool workletRuntime);
};

}  // namespace expo::harmony

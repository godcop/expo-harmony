#pragma once

#include <RNOH/Package.h>

namespace expo::harmony {

class ExpoDevLauncherTurboModuleFactoryDelegate final : public rnoh::TurboModuleFactoryDelegate {
public:
  SharedTurboModule createTurboModule(Context context, const std::string &name) const override;
};

class ExpoDevLauncherPackage final : public rnoh::Package {
public:
  explicit ExpoDevLauncherPackage(Package::Context context) : Package(std::move(context)) {}

  std::unique_ptr<rnoh::TurboModuleFactoryDelegate> createTurboModuleFactoryDelegate() override;
};

}  // namespace expo::harmony

namespace rnoh {
using ExpoDevLauncherPackage = expo::harmony::ExpoDevLauncherPackage;
}

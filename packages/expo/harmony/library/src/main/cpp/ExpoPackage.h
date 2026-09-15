#pragma once

#include <RNOH/Package.h>

#include "runtime/RuntimeErrors.h"

namespace expo::harmony {

class ExpoPackage final : public rnoh::Package {
public:
  explicit ExpoPackage(Package::Context context) : Package(std::move(context)) {}

  std::vector<rnoh::ArkTSMessageHandler::Shared> createArkTSMessageHandlers() override;
  rnoh::GlobalJSIBinders createGlobalJSIBinders(const rnoh::GlobalJSIBinder::Context &context) override;

private:
  std::shared_ptr<RuntimeErrors> errors_ = std::make_shared<RuntimeErrors>();
};

}  // namespace expo::harmony

namespace rnoh {
using ExpoPackage = expo::harmony::ExpoPackage;
}

#pragma once

#include <RNOH/Package.h>

#include "runtime/RnohBundle.h"

namespace expo::harmony {

class ExpoModulesCoreTurboModuleFactoryDelegate final
    : public rnoh::TurboModuleFactoryDelegate {
public:
  SharedTurboModule createTurboModule(
      Context context,
      const std::string &name) const override;
};

class ExpoModulesCorePackage final : public rnoh::Package {
public:
  explicit ExpoModulesCorePackage(Package::Context context)
      : Package(std::move(context)) {}

  rnoh::GlobalJSIBinders createGlobalJSIBinders(const rnoh::GlobalJSIBinder::Context &context) override;

  std::unique_ptr<rnoh::TurboModuleFactoryDelegate>
  createTurboModuleFactoryDelegate() override;

  std::vector<facebook::react::ComponentDescriptorProvider>
  createComponentDescriptorProviders() override;

  rnoh::ComponentNapiBinderByString createComponentNapiBinderByName() override;

  rnoh::ComponentInstance::Shared createComponentInstance(
      const rnoh::ComponentInstance::Context &context) override;

  rnoh::EventEmitRequestHandlers createEventEmitRequestHandlers() override;

  std::vector<rnoh::ArkTSMessageHandler::Shared> createArkTSMessageHandlers() override;

private:
  std::shared_ptr<RnohBundle> bundle_ = std::make_shared<RnohBundle>();
};

}  // namespace expo::harmony

#pragma once

#include <RNOH/Package.h>

namespace rnoh {

class ExpoDomWebViewPackage final : public Package {
public:
  explicit ExpoDomWebViewPackage(Package::Context context)
      : Package(std::move(context)) {}

  std::vector<ArkTSMessageHandler::Shared> createArkTSMessageHandlers() override;
};

}

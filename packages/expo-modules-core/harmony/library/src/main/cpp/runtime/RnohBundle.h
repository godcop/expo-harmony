#pragma once

#include <mutex>
#include <unordered_map>

#include <RNOH/ArkTSMessageHandler.h>
#include <RNOH/GlobalJSIBinder.h>
#include <RNOH/RNInstance.h>

namespace expo::harmony {

class RnohBundle {
public:
  void subscribe(const std::string &id, std::weak_ptr<rnoh::RNInstance> instance);
  void unsubscribe(const std::string &id);
  void complete();

private:
  std::mutex mutex_;
  bool loaded_ = false;
  std::unordered_map<std::string, std::weak_ptr<rnoh::RNInstance>> requests_;
};

rnoh::ArkTSMessageHandler::Shared createBundleHandler(std::shared_ptr<RnohBundle> bundle);
rnoh::GlobalJSIBinders createBundleBinders(const rnoh::GlobalJSIBinder::Context &context, std::shared_ptr<RnohBundle> bundle);

}  // namespace expo::harmony

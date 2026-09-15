#include "RnohBundle.h"

#include "Protocol.h"

namespace expo::harmony {

void RnohBundle::subscribe(const std::string &id, std::weak_ptr<rnoh::RNInstance> instance) {
  {
    std::lock_guard lock(mutex_);
    if (!loaded_) {
      requests_[id] = instance;
      return;
    }
  }
  if (auto owner = instance.lock()) {
    owner->postMessageToArkTS(protocol::kBundleReady, folly::dynamic::object("request", id));
  }
}

void RnohBundle::unsubscribe(const std::string &id) {
  std::lock_guard lock(mutex_);
  requests_.erase(id);
}

void RnohBundle::complete() {
  decltype(requests_) requests;
  {
    std::lock_guard lock(mutex_);
    loaded_ = true;
    requests.swap(requests_);
  }
  for (const auto &[id, weak] : requests) {
    if (auto owner = weak.lock()) {
      owner->postMessageToArkTS(protocol::kBundleReady, folly::dynamic::object("request", id));
    }
  }
}

namespace {
class BundleHandler final : public rnoh::ArkTSMessageHandler {
public:
  explicit BundleHandler(std::shared_ptr<RnohBundle> bundle) : bundle_(std::move(bundle)) {}

  void handleArkTSMessage(const Context &context) override {
    if ((context.messageName != protocol::kBundleWait && context.messageName != protocol::kBundleCancel) || !context.messagePayload.isObject()) {
      return;
    }
    const auto id = context.messagePayload.getDefault("request", "");
    if (!id.isString() || id.asString().empty()) {
      return;
    }
    if (context.messageName == protocol::kBundleCancel) {
      bundle_->unsubscribe(id.asString());
    } else {
      bundle_->subscribe(id.asString(), context.rnInstance);
    }
  }

private:
  std::shared_ptr<RnohBundle> bundle_;
};

class BundleBinder final : public rnoh::GlobalJSIBinder {
public:
  BundleBinder(Context context, std::shared_ptr<RnohBundle> bundle) : GlobalJSIBinder(context), bundle_(std::move(bundle)) {}

  void createBindings(facebook::jsi::Runtime &, std::shared_ptr<rnoh::TurboModuleProvider>) override {
    // RNOH 0.84.1 resolves loadScript before evaluation. Buffered binders run after ReactInstance evaluates its first bundle.
    bundle_->complete();
  }

private:
  std::shared_ptr<RnohBundle> bundle_;
};
}  // namespace

rnoh::ArkTSMessageHandler::Shared createBundleHandler(std::shared_ptr<RnohBundle> bundle) {
  return std::make_shared<BundleHandler>(std::move(bundle));
}

rnoh::GlobalJSIBinders createBundleBinders(const rnoh::GlobalJSIBinder::Context &context, std::shared_ptr<RnohBundle> bundle) {
  return {std::make_shared<BundleBinder>(context, std::move(bundle))};
}

}  // namespace expo::harmony

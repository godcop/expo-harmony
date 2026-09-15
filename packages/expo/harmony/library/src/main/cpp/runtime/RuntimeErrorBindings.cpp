#include "RuntimeErrorBindings.h"

#include <stdexcept>

#include <react/renderer/runtimescheduler/RuntimeScheduler.h>

#include "Protocol.h"

namespace expo::harmony {
namespace {

class ExpoRuntimeMessageHandler final : public rnoh::ArkTSMessageHandler {
public:
  explicit ExpoRuntimeMessageHandler(std::shared_ptr<RuntimeErrors> errors) : errors_(std::move(errors)) {}

  void handleArkTSMessage(const Context &context) override {
    const bool observe = context.messageName == protocol::kRuntimeObserve;
    if ((!observe && context.messageName != protocol::kRuntimeUnobserve) || !context.messagePayload.isObject()) {
      return;
    }
    const auto id = context.messagePayload.getDefault("observer", "");
    if (!id.isString() || id.asString().empty()) {
      return;
    }
    auto instance = context.rnInstance.lock();
    if (!instance) {
      return;
    }

    try {
      auto scheduler = instance->getContextContainer()
                           .at<std::weak_ptr<facebook::react::RuntimeScheduler>>("RuntimeScheduler")
                           .lock();
      if (!scheduler) {
        throw std::runtime_error("The React runtime scheduler is unavailable.");
      }

      scheduler->scheduleWork([weak = context.rnInstance, errors = errors_, id = id.asString(), observe](facebook::jsi::Runtime &runtime) {
        auto instance = weak.lock();
        if (!instance) {
          return;
        }
        folly::dynamic reply = folly::dynamic::object("observer", id);
        try {
          if (observe) {
            errors->subscribe(runtime, id, [weak](const std::string &id, const folly::dynamic &error) {
              auto instance = weak.lock();
              if (!instance) {
                return;
              }
              auto event = error;
              event["observer"] = id;
              instance->postMessageToArkTS(protocol::kRuntimeError, event);
            });
          } else {
            errors->unsubscribe(runtime, id);
          }
        } catch (const std::exception &error) {
          reply["error"] = error.what();
        }
        instance->postMessageToArkTS(protocol::kRuntimeObserved, reply);
      });
    } catch (const std::exception &error) {
      instance->postMessageToArkTS(protocol::kRuntimeObserved,
                                   folly::dynamic::object("observer", id)("error", error.what()));
    }
  }

private:
  std::shared_ptr<RuntimeErrors> errors_;
};

// RNOH runs binders after the first bundle. Registration may arrive before or after it.
class ExpoRuntimeErrorBinder final : public rnoh::GlobalJSIBinder {
public:
  ExpoRuntimeErrorBinder(Context context, std::shared_ptr<RuntimeErrors> errors)
      : GlobalJSIBinder(context), errors_(std::move(errors)) {}

  void createBindings(facebook::jsi::Runtime &runtime,
                      std::shared_ptr<rnoh::TurboModuleProvider>) override {
    errors_->ready(runtime);
  }

private:
  std::shared_ptr<RuntimeErrors> errors_;
};

}  // namespace

std::vector<rnoh::ArkTSMessageHandler::Shared> createRuntimeErrorHandlers(std::shared_ptr<RuntimeErrors> errors) {
  return {std::make_shared<ExpoRuntimeMessageHandler>(std::move(errors))};
}

rnoh::GlobalJSIBinders createRuntimeErrorBinders(const rnoh::GlobalJSIBinder::Context &context, std::shared_ptr<RuntimeErrors> errors) {
  return {std::make_shared<ExpoRuntimeErrorBinder>(context, std::move(errors))};
}

}  // namespace expo::harmony

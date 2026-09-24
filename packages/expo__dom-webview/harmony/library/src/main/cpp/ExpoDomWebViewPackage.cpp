#include "ExpoDomWebViewPackage.h"

#include <cmath>
#include <limits>
#include <react/renderer/runtimescheduler/RuntimeScheduler.h>
#include <runtime/RuntimeContext.h>
#include <runtime/RuntimeInstaller.h>

namespace {

constexpr auto kEvalRequest = "ExpoDomWebView.eval";
constexpr auto kEvalResult = "ExpoDomWebView.evalResult";
constexpr auto kRuntimeScheduler = "RuntimeScheduler";

class EvalHandler final : public rnoh::ArkTSMessageHandler {
public:
  void handleArkTSMessage(const Context &context) override {
    if (context.messageName != kEvalRequest || !context.messagePayload.isObject()) return;

    const auto &payload = context.messagePayload;
    const auto id = payload.getDefault("requestId", nullptr);
    const auto source = payload.getDefault("source", nullptr);
    const auto epoch = payload.getDefault("runtimeEpoch", nullptr);
    const auto tag = payload.getDefault("tag", nullptr);
    const auto component = payload.getDefault("componentName", nullptr);
    const auto instance = context.rnInstance.lock();
    if (!instance || !id.isString()) return;

    // ArkJS transports JavaScript numbers as folly doubles, including tags.
    if (!source.isString() || !epoch.isString() || !component.isString() ||
        !tag.isNumber() || !std::isfinite(tag.asDouble()) ||
        std::floor(tag.asDouble()) != tag.asDouble() || tag.asDouble() <= 0 ||
        tag.asDouble() > std::numeric_limits<facebook::react::Tag>::max()) {
      instance->postMessageToArkTS(kEvalResult, folly::dynamic::object
          ("requestId", id)("error", "Invalid Expo DOM evaluation request."));
      return;
    }

    const auto service = instance->getContextContainer()
        .find<std::weak_ptr<facebook::react::RuntimeScheduler>>(kRuntimeScheduler);
    const auto scheduler = service ? service->lock() : nullptr;
    if (!scheduler) {
      instance->postMessageToArkTS(kEvalResult, folly::dynamic::object
          ("requestId", id)("error", "The React runtime is unavailable."));
      return;
    }

    scheduler->scheduleWork([
        owner = context.rnInstance, id = id.asString(),
        source = source.asString(), epoch = epoch.asString(),
        tag = static_cast<facebook::react::Tag>(tag.asDouble()), component = component.asString()
    ](facebook::jsi::Runtime &runtime) {
      const auto instance = owner.lock();
      if (!instance) return;

      folly::dynamic response = folly::dynamic::object("requestId", id);
      try {
        auto expo = expo::harmony::RuntimeInstaller::installedContext(runtime);
        if (!expo || expo->runtimeEpochString() != epoch) {
          throw std::runtime_error("The Expo runtime was destroyed or replaced.");
        }
        expo->requireMountedView(tag, component);

        auto result = runtime.evaluateJavaScript(
            std::make_shared<facebook::jsi::StringBuffer>(source), "expo-dom-webview://native-eval");
        if (!result.isString()) throw std::runtime_error("The Expo DOM evaluation wrapper did not return a string.");
        response["result"] = result.getString(runtime).utf8(runtime);
      } catch (const std::exception &error) {
        response["error"] = error.what();
      } catch (...) {
        response["error"] = "Expo DOM evaluation failed with an unknown native exception.";
      }

      instance->postMessageToArkTS(kEvalResult, response);
    });
  }
};

}

std::vector<rnoh::ArkTSMessageHandler::Shared>
rnoh::ExpoDomWebViewPackage::createArkTSMessageHandlers() {
  return {std::make_shared<EvalHandler>()};
}

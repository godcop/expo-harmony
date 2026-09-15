#include "RuntimeErrors.h"

namespace expo::harmony {
namespace jsi = facebook::jsi;

struct RuntimeErrors::Binding {
  explicit Binding(jsi::Function handler) : original(std::move(handler)) {}

  jsi::Function original;
  std::unique_ptr<jsi::WeakObject> wrapper;
  bool active = true;
};

void RuntimeErrors::subscribe(jsi::Runtime &runtime, const std::string &id, Notify notify) {
  observers_[id] = std::move(notify);

  try {
    if (!registered_) {
      auto listener = jsi::Function::createFromHostFunction(
          runtime, jsi::PropNameID::forAscii(runtime, "expoRuntimeError"), 1, [weak = weak_from_this()](jsi::Runtime &runtime, const jsi::Value &, const jsi::Value *args, size_t count) {
            const auto self = weak.lock();
            if (!self || self->observers_.empty() || count == 0 || !args[0].isObject()) {
              return jsi::Value::undefined();
            }
            try {
              auto error = args[0].getObject(runtime);
              auto fatal = error.getProperty(runtime, "isFatal");
              auto message = error.getProperty(runtime, "originalMessage");
              if (!message.isString()) {
                message = error.getProperty(runtime, "message");
              }
              if (fatal.isBool() && fatal.getBool() && message.isString()) {
                auto stack = error.getProperty(runtime, "stack");
                auto extra = error.getProperty(runtime, "extraData");
                if (extra.isObject()) {
                  auto raw = extra.getObject(runtime).getProperty(runtime, "rawStack");
                  if (raw.isString()) {
                    stack = std::move(raw);
                  }
                }
                self->emit(folly::dynamic::object("message", message.getString(runtime).utf8(runtime))("stack", jsi::dynamicFromValue(runtime, stack)));
              }
            } catch (...) {
              // Observing a fatal error must not interrupt React's error handling.
            }
            return jsi::Value::undefined();
          });
      runtime.global().getPropertyAsFunction(runtime, "RN$registerExceptionListener").call(runtime, listener);
      registered_ = true;
    }
    if (ready_) {
      install(runtime);
    }
  } catch (const std::exception &error) {
    try {
      unsubscribe(runtime, id);
    } catch (...) {}
    throw jsi::JSError(runtime, error.what());
  }
}

void RuntimeErrors::unsubscribe(jsi::Runtime &runtime, const std::string &id) {
  observers_.erase(id);
  if (!observers_.empty()) {
    return;
  }
  auto binding = binding_.lock();
  binding_.reset();
  if (!binding) {
    return;
  }

  binding->active = false;
  auto utils = runtime.global().getPropertyAsObject(runtime, "ErrorUtils");
  auto current = utils.getPropertyAsFunction(runtime, "getGlobalHandler").callWithThis(runtime, utils);
  if (jsi::Value::strictEquals(runtime, current, binding->wrapper->lock(runtime))) {
    utils.getPropertyAsFunction(runtime, "setGlobalHandler").callWithThis(runtime, utils, binding->original);
  }
}

void RuntimeErrors::ready(jsi::Runtime &runtime) {
  ready_ = true;
  if (!observers_.empty()) {
    install(runtime);
  }
}

void RuntimeErrors::install(jsi::Runtime &runtime) {
  if (!binding_.expired()) {
    return;
  }
  auto enabled = runtime.global().getProperty(runtime, "RN$useAlwaysAvailableJSErrorHandling");
  if (enabled.isBool() && enabled.getBool()) {
    return;
  }
  auto value = runtime.global().getProperty(runtime, "ErrorUtils");
  if (!value.isObject()) {
    return;
  }

  auto utils = value.getObject(runtime);
  auto binding = std::make_shared<Binding>(
      utils.getPropertyAsFunction(runtime, "getGlobalHandler").callWithThis(runtime, utils).getObject(runtime).getFunction(runtime));
  auto listener = jsi::Function::createFromHostFunction(
      runtime, jsi::PropNameID::forAscii(runtime, "expoRuntimeError"), 2, [weak = weak_from_this(), binding](jsi::Runtime &runtime, const jsi::Value &receiver, const jsi::Value *args, size_t count) {
        const auto self = weak.lock();
        if (self && binding->active && count > 1 && args[1].isBool() && args[1].getBool()) {
          try {
            jsi::JSError error(runtime, jsi::Value(runtime, args[0]));
            self->emit(folly::dynamic::object("message", error.getMessage())("stack", error.getStack()));
          } catch (...) {
            // An observer must never prevent the application's error handler from running.
          }
        }
        if (receiver.isObject()) {
          return binding->original.callWithThis(runtime, receiver.getObject(runtime), args, count);
        }
        return binding->original.call(runtime, args, count);
      });
  binding->wrapper = std::make_unique<jsi::WeakObject>(runtime, listener);
  utils.getPropertyAsFunction(runtime, "setGlobalHandler").callWithThis(runtime, utils, listener);
  binding_ = binding;
}

void RuntimeErrors::emit(const folly::dynamic &error) {
  const auto observers = observers_;
  for (const auto &[id, notify] : observers) {
    if (!observers_.contains(id)) {
      continue;
    }
    try {
      notify(id, error);
    } catch (...) {
      // One failed subscriber must not suppress the others or the default handler.
    }
  }
}

}  // namespace expo::harmony

#pragma once

#include <functional>
#include <map>
#include <memory>
#include <string>

#include <jsi/JSIDynamic.h>

namespace expo::harmony {

class RuntimeErrors : public std::enable_shared_from_this<RuntimeErrors> {
public:
  using Notify = std::function<void(const std::string &, const folly::dynamic &)>;

  void subscribe(facebook::jsi::Runtime &runtime, const std::string &id, Notify notify);
  void unsubscribe(facebook::jsi::Runtime &runtime, const std::string &id);
  void ready(facebook::jsi::Runtime &runtime);

private:
  struct Binding;
  void install(facebook::jsi::Runtime &runtime);
  void emit(const folly::dynamic &error);

  std::map<std::string, Notify> observers_;
  std::weak_ptr<Binding> binding_;
  bool registered_ = false;
  bool ready_ = false;
};

}  // namespace expo::harmony

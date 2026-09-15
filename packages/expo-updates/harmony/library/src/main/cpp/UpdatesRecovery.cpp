#include <exception>
#include <vector>

#include <napi/native_api.h>

napi_value crash(napi_env env, napi_callback_info info) {
  size_t count = 2;
  napi_value args[2] = {};
  size_t size = 0;
  if (napi_get_cb_info(env, info, &count, args, nullptr, nullptr) != napi_ok || count != 1 || napi_get_value_string_utf8(env, args[0], nullptr, 0, &size) != napi_ok) {
    napi_throw_type_error(env, "ERR_UPDATES_RECOVERY", "Expected the original fatal error message.");
    return nullptr;
  }

  try {
    std::vector<char> message(size + 1);
    if (napi_get_value_string_utf8(env, args[0], message.data(), message.size(), &size) != napi_ok) {
      napi_throw_error(env, "ERR_UPDATES_RECOVERY", "Unable to read the original fatal error message.");
      return nullptr;
    }
    napi_fatal_error("ExpoUpdates", NAPI_AUTO_LENGTH, message.data(), size);
  } catch (const std::exception &error) {
    napi_throw_error(env, "ERR_UPDATES_RECOVERY", error.what());
    return nullptr;
  }
}

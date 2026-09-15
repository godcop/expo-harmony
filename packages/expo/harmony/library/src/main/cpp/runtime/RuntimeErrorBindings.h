#pragma once

#include <RNOH/Package.h>

#include "RuntimeErrors.h"

namespace expo::harmony {

std::vector<rnoh::ArkTSMessageHandler::Shared> createRuntimeErrorHandlers(std::shared_ptr<RuntimeErrors> errors);
rnoh::GlobalJSIBinders createRuntimeErrorBinders(const rnoh::GlobalJSIBinder::Context &context,
                                                 std::shared_ptr<RuntimeErrors> errors);

}  // namespace expo::harmony

import { Headers } from '../UpdatesProtocol';
import { UpdatesSelectionPolicy } from './UpdatesSelectionPolicy';
import { FilterAwareLauncher, SingleUpdateLauncher } from './LauncherSelectionPolicy';
import { FilterAwareLoader } from './LoaderSelectionPolicy';
import { DevelopmentReaper, FilterAwareReaper } from './ReaperSelectionPolicy';

export class SelectionPolicyFactory {
  static filterAware(runtime: string, url: string, headers: Headers): UpdatesSelectionPolicy {
    return new UpdatesSelectionPolicy(new FilterAwareLauncher(runtime, url, headers), new FilterAwareLoader(url, headers), new FilterAwareReaper());
  }

  static development(runtime: string, url?: string, headers?: Headers): UpdatesSelectionPolicy {
    return new UpdatesSelectionPolicy(new FilterAwareLauncher(runtime, url, headers), new FilterAwareLoader(url, headers), new DevelopmentReaper());
  }

  static singleUpdate(id: string, current: UpdatesSelectionPolicy): UpdatesSelectionPolicy {
    return new UpdatesSelectionPolicy(new SingleUpdateLauncher(id), current.loader, current.reaper);
  }
}

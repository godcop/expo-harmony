import type Want from '@ohos.app.ability.Want';

export function copyWant(want: Want): Want {
  return { ...want, entities: want.entities?.slice(), parameters: want.parameters === undefined ? undefined : { ...want.parameters } };
}

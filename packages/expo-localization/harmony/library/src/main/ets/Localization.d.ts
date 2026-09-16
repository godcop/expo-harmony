declare module 'libexpo_localization.so' {
  export interface NumericInfo {
    decimalSeparator: string | null;
    digitGroupingSeparator: string | null;
    currencyCode: string | null;
    currencySymbol: string | null;
  }

  declare const localization: {
    getNumericInfo(languageTag: string): NumericInfo;
    getCalendarType(languageTag: string): string | null;
  };

  export default localization;
}

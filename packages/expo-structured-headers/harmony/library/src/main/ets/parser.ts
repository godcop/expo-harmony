import {
  Dictionary,
  List,
  Item,
  BareItem,
  Parameters,
  InnerList,
  ByteSequence,
  Decimal
} from './types';

import { Token } from './token';

import { isAscii } from './util';

export function parseDictionary(input: string | string[]): Dictionary {
  const parser = new Parser(input);
  return parser.parseDictionary();
}

export function parseList(input: string | string[]): List {
  const parser = new Parser(input);
  return parser.parseList();
}

export function parseItem(input: string | string[]): Item {
  const parser = new Parser(input);
  return parser.parseItem();
}

export function parseBareItem(input: string): BareItem {
  const parser = new Parser(input);
  const value = parser.parseBareItem();
  parser.checkTrail();

  return value;
}
export function parseParameters(input: string): Parameters {
  const parser = new Parser(input);
  const value = parser.parseParameters();
  parser.checkTrail();

  return value;
}
export function parseKey(input: string): string {
  const parser = new Parser(input);
  const value = parser.parseKey();
  parser.checkTrail();

  return value;
}
export function parseString(input: string): Item {
  const parser = new Parser(input);
  const value: Item = [parser.parseString(), parser.parseParameters()];
  parser.checkTrail();

  return value;
}
export function parseToken(input: string): Item {
  const parser = new Parser(input);
  const value: Item = [parser.parseToken(), parser.parseParameters()];
  parser.checkTrail();

  return value;
}
export function parseByteSequence(input: string): Item {
  const parser = new Parser(input);
  const value: Item = [parser.parseByteSequence(), parser.parseParameters()];
  parser.checkTrail();

  return value;
}
export function parseBoolean(input: string): Item {
  const parser = new Parser(input);
  const value: Item = [parser.parseBoolean(), parser.parseParameters()];
  parser.checkTrail();

  return value;
}
export function parseIntegerOrDecimal(input: string): Item {
  const parser = new Parser(input);
  const value: Item = [parser.parseIntegerOrDecimal(), parser.parseParameters()];
  parser.checkTrail();

  return value;
}
export function parseInnerList(input: string): InnerList {
  const parser = new Parser(input);
  const value = parser.parseInnerList();
  parser.checkTrail();

  return value;
}
export function parseItemOrInnerList(input: string): Item | InnerList {
  const parser = new Parser(input);
  const value = parser.parseItemOrInnerList();
  parser.checkTrail();

  return value;
}

export class ParseError extends Error {
  readonly position: number;

  constructor(position: number, message:string) {
    super(`Parse error: ${message} at offset ${position}`);
    this.name = 'ParseError';
    this.position = position;
  }
}

export default class Parser {
  private readonly input: string;
  private pos: number;
  private readonly boundaries: number[];

  constructor(input: string | string[]) {
    this.boundaries = [];

    if (Array.isArray(input)) {
      if (input.length === 0) throw new ParseError(0, 'Empty input');

      let joined = '';
      for (const [index, line] of input.entries()) {
        if (typeof line !== 'string') throw new TypeError('Field lines must be strings.');

        if (index > 0) {
          this.boundaries.push(joined.length);
          joined += ',';
        }
        joined += line;
      }

      this.input = joined;
    } else if (typeof input === 'string') {
      this.input = input;
    } else {
      throw new TypeError('Parser input must be a string or an array of strings.');
    }

    for (let index = 0; index < this.input.length; index++) {
      if (this.input.charCodeAt(index) > 0x7f) {
        throw new ParseError(index, 'Field lines must contain only ASCII characters');
      }
    }

    this.pos = 0;
  }

  parseDictionary(): Dictionary {
    this.skipWS();
    const dictionary: Dictionary = new Map();

    while(!this.eof()) {
      const key = this.parseKey();
      let member: Item | InnerList;
      if (this.lookChar()==='=') {
        this.pos++;
        member = this.parseItemOrInnerList();
      } else {
        member = [true, this.parseParameters()];
      }

      dictionary.set(key, member);

      this.skipOWS();
      if (this.eof()) {
        return dictionary;
      }

      this.expectChar(',');
      this.pos++;
      this.skipOWS();
      if (this.eof()) {
        throw new ParseError(this.pos, 'Dictionary contained a trailing comma');
      }
    }

    return dictionary;
  }

  parseList(): List {
    this.skipWS();
    const members: List = [];
    while(!this.eof()) {
      members.push(
        this.parseItemOrInnerList()
      );
      this.skipOWS();
      if (this.eof()) {
        return members;
      }

      this.expectChar(',');
      this.pos++;
      this.skipOWS();
      if (this.eof()) {
        throw new ParseError(this.pos, 'A list may not end with a trailing comma');
      }
    }

    return members;
  }

  parseItem(standalone: boolean = true): Item {
    if (standalone) this.skipWS();

    const result: Item = [
      this.parseBareItem(),
      this.parseParameters()
    ];

    if (standalone) {
      this.skipWS();
      this.checkTrail();
    }

    return result;
  }

  parseItemOrInnerList(): Item|InnerList {
    if (this.lookChar()==='(') {
      return this.parseInnerList();
    } else {
      return this.parseItem(false);
    }
  }

  parseInnerList(): InnerList {
    this.expectChar('(');
    this.pos++;

    const items: Item[] = [];

    while(!this.eof()) {
      this.skipWS();
      if (this.lookChar() === ')') {
        this.pos++;
        return [
          items,
          this.parseParameters()
        ];
      }

      items.push(this.parseItem(false));

      const next = this.lookChar();
      if (next!==' ' && next !== ')') {
        throw new ParseError(this.pos, 'Expected a whitespace or ) after every item in an inner list');
      }
    }

    throw new ParseError(this.pos, 'Could not find end of inner list');
  }

  parseBareItem(): BareItem {
    const char = this.lookChar();
    if (char.match(/^[-0-9]/)) {
      return this.parseIntegerOrDecimal();
    }
    if (char === '"') {
      return this.parseString();
    }
    if (char.match(/^[A-Za-z*]/)) {
      return this.parseToken();
    }
    if (char === ':' ) {
      return this.parseByteSequence();
    }
    if (char === '?') {
      return this.parseBoolean();
    }

    throw new ParseError(this.pos, 'Unexpected input');
  }

  parseParameters(): Parameters {
    const parameters: Parameters = new Map();

    while(!this.eof()) {
      const char = this.lookChar();
      if (char!==';') {
        break;
      }

      this.pos++;
      this.skipWS();

      const key = this.parseKey();
      let value: BareItem = true;
      if (this.lookChar() === '=') {
        this.pos++;
        value = this.parseBareItem();
      }

      parameters.set(key, value);
    }

    return parameters;
  }

  parseIntegerOrDecimal(): number | Decimal {
    let type: 'integer' | 'decimal' = 'integer';
    let sign = 1;
    let number = '';
    if (this.lookChar()==='-') {
      sign = -1;
      this.pos++;
    }

    if (!isDigit(this.lookChar())) {
      throw new ParseError(this.pos, 'Expected a digit (0-9)');
    }

    while(!this.eof()) {
      const char = this.getChar();
      if (isDigit(char)) {
        number+=char;
      } else if (type === 'integer' && char === '.') {
        if (number.length>12) {
          throw new ParseError(this.pos, 'Exceeded maximum decimal length');
        }
        number+='.';
        type = 'decimal';
      } else {
        this.pos--;
        break;
      }

      if (type === 'integer' && number.length>15) {
        throw new ParseError(this.pos, 'Exceeded maximum integer length');
      }
      if (type === 'decimal' && number.length>16) {
        throw new ParseError(this.pos, 'Exceeded maximum decimal length');
      }
    }

    if (type === 'integer') {
      return parseInt(number, 10) * sign;
    } else {
      if (number.endsWith('.')) {
        throw new ParseError(this.pos, 'Decimal cannot end on a period');
      }
      if (number.split('.')[1].length>3) {
        throw new ParseError(this.pos, 'Number of digits after the decimal point cannot exceed 3');
      }

      const digits = number.split('.')[0] + number.split('.')[1].padEnd(3, '0');

      return Decimal.fromPermille(parseInt(digits, 10) * sign);
    }
  }

  parseString(): string {
    let value = '';
    this.expectChar('"');
    this.pos++;

    while(!this.eof()) {
      if (this.boundaries.indexOf(this.pos) !== -1) {
        throw new ParseError(this.pos, 'String crosses field line boundary');
      }
      const char = this.getChar();
      if (char==='\\') {
        if (this.eof()) {
          throw new ParseError(this.pos, 'Unexpected end of input');
        }
        if (this.boundaries.indexOf(this.pos) !== -1) {
          throw new ParseError(this.pos, 'String crosses field line boundary');
        }

        const next = this.getChar();
        if (next!=='\\' && next !== '"') {
          throw new ParseError(this.pos, 'A backslash must be followed by another backslash or double quote');
        }

        value+=next;
      } else if (char === '"') {
        return value;
      } else if (!isAscii(char)) {
        throw new ParseError(this.pos, 'Strings must be in the ASCII range');
      } else {
        value += char;
      }
    }
    throw new ParseError(this.pos, 'Unexpected end of input');
  }

  parseToken(): Token {
    if (!/^[A-Za-z*]$/.test(this.lookChar())) {
      throw new ParseError(this.pos, 'A token must begin with an asterisk or letter (A-Z or a-z)');
    }

    let value = '';
    while(!this.eof()) {
      const char = this.lookChar();
      if (!/^[:/!#$%&'*+\-.^_`|~A-Za-z0-9]$/.test(char)) {
        return new Token(value);
      }
      value += this.getChar();
    }

    return new Token(value);
  }

  parseByteSequence(): ByteSequence {
    this.expectChar(':');
    this.pos++;
    const end = this.input.indexOf(':', this.pos);
    if (end === -1) {
      throw new ParseError(this.pos, 'Could not find a closing ":" character to mark end of Byte Sequence');
    }

    const value = this.input.substring(this.pos, end);
    this.pos += value.length+1;

    try {
      return new ByteSequence(value);
    } catch (_) {
      throw new ParseError(end, 'Invalid Base64 byte sequence');
    }
  }

  parseBoolean(): boolean {
    this.expectChar('?');
    this.pos++;

    const char = this.getChar();
    if (char === '1') {
      return true;
    }
    if (char === '0') {
      return false;
    }
    throw new ParseError(this.pos, 'Unexpected character. Expected a "1" or a "0"');
  }

  parseKey(): string {
    if (!this.lookChar().match(/^[a-z*]/)) {
      throw new ParseError(this.pos, 'A key must begin with an asterisk or letter (a-z)');
    }

    let value = '';

    while(!this.eof()) {
      const char = this.lookChar();
      if (!/^[a-z0-9_\-.*]$/.test(char)) {
        return value;
      }
      value += this.getChar();
    }

    return value;
  }

  private lookChar():string {
    return this.input.charAt(this.pos);
  }

  private expectChar(char: string): void {
    if (this.lookChar()!==char) {
      throw new ParseError(this.pos, `Expected ${char}`);
    }
  }

  private getChar(): string {
    if (this.eof()) return '';
    return this.input.charAt(this.pos++);
  }
  private eof():boolean {
    return this.pos>=this.input.length;
  }
  private skipOWS(): void {
    while (true) {
      const c = this.input.substring(this.pos, this.pos + 1);
      if (c === ' ' || c === '\t') {
        this.pos++;
      } else {
        break;
      }
    }
  }
  private skipWS(): void {
    while(this.lookChar()===' ') {
      this.pos++;
    }
  }

  checkTrail(): void {
    if (!this.eof()) {
      throw new ParseError(this.pos, 'Unexpected characters at end of input');
    }
  }
}

const digit = /^[0-9]$/;
function isDigit(char: string): boolean {
  return digit.test(char);
}

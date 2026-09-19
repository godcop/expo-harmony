export class SourceToken {
  constructor(readonly value: string, readonly kind: string = 'plain') {}
}

export function highlightSource(source: string): SourceToken[] {
  if (source.length > 512 * 1024) return [new SourceToken(source)];

  const pattern = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`|\b(?:async|await|break|case|catch|class|const|continue|default|delete|do|else|export|extends|false|finally|for|from|function|if|import|in|instanceof|interface|let|new|null|return|static|super|switch|this|throw|true|try|type|typeof|undefined|var|void|while|yield)\b|\b\d+(?:\.\d+)?\b/g;
  const result: SourceToken[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    if (result.length > 3000) return [new SourceToken(source)];
    if (match.index > cursor) result.push(new SourceToken(source.slice(cursor, match.index)));
    const value = match[0];
    const kind = value.startsWith('/') ? 'comment' : /^["'`]/.test(value) ? 'string' : /^\d/.test(value) ? 'number' : 'keyword';
    result.push(new SourceToken(value, kind));
    cursor = pattern.lastIndex;
  }
  if (cursor < source.length) result.push(new SourceToken(source.slice(cursor)));

  return result;
}

/**
 * Checks if a string consists entirely of CJK characters.
 * Used to determine whether to omit spaces in Eastern name order
 * (Chinese, Japanese kanji/kana, Korean hangul don't use spaces between name parts).
 */
function isCJK(text: string): boolean {
  return /^[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]+$/.test(text);
}

/**
 * Determines the separator for joining name parts.
 * Returns '' if all parts are CJK characters, ' ' otherwise.
 */
function nameSeparator(...parts: (string | null | undefined)[]): string {
  const nonEmpty = parts.filter((p): p is string => !!p);
  return nonEmpty.length > 0 && nonEmpty.every(isCJK) ? '' : ' ';
}

/**
 * Formats a person's name with optional nickname and all name parts
 * Western format: "Name 'Nickname' MiddleName Surname SecondLastName"
 * Eastern format: "Surname SecondLastName 'Nickname' Name MiddleName"
 * CJK names in Eastern order omit spaces (e.g., 田中太郎 not 田中 太郎)
 */
export function formatPersonName(
  name: string,
  surname?: string | null,
  middleName?: string | null,
  secondLastName?: string | null,
  nickname?: string | null,
  nameOrder?: 'WESTERN' | 'EASTERN'
): string {
  const nicknameStr = nickname ? `'${nickname}'` : null;

  if (nameOrder === 'EASTERN') {
    const sep = nameSeparator(name, surname, middleName, secondLastName);
    const parts: string[] = [];
    if (surname) parts.push(surname);
    if (secondLastName) parts.push(secondLastName);
    if (nicknameStr) parts.push(nicknameStr);
    parts.push(name);
    if (middleName) parts.push(middleName);
    return parts.join(sep);
  }

  // Western order (default)
  const parts: string[] = [name];
  if (nicknameStr) parts.push(nicknameStr);
  if (middleName) parts.push(middleName);
  if (surname) parts.push(surname);
  if (secondLastName) parts.push(secondLastName);
  return parts.join(' ');
}

/**
 * Formats a person's full name for display
 * Same as formatPersonName but with a person object
 */
export function formatFullName(person: {
  name: string;
  surname?: string | null;
  middleName?: string | null;
  secondLastName?: string | null;
  nickname?: string | null;
}, nameOrder?: 'WESTERN' | 'EASTERN'): string {
  return formatPersonName(
    person.name,
    person.surname,
    person.middleName,
    person.secondLastName,
    person.nickname,
    nameOrder
  );
}

/**
 * Formats a person's name for display in network graphs
 * Shows only nickname (if present) or first name, plus surname
 * This keeps graph node labels concise and readable
 */
export function formatGraphName(person: {
  name: string;
  surname?: string | null;
  nickname?: string | null;
}, nameOrder?: 'WESTERN' | 'EASTERN'): string {
  const displayName = person.nickname || person.name;

  if (!person.surname) return displayName;

  if (nameOrder === 'EASTERN') {
    const sep = nameSeparator(displayName, person.surname);
    return `${person.surname}${sep}${displayName}`;
  }

  return `${displayName} ${person.surname}`;
}

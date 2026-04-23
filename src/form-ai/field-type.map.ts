export const AI_TYPE_TO_DB: Record<string, string> = {
  text: 'TEXT',
  number: 'NUMBER',
  date: 'DATE',
  datetime: 'DATETIME',
  single_select: 'SELECT',
  multi_select: 'MULTISELECT',
  boolean: 'BOOLEAN',
  signature: 'SIGNATURE',
  photo: 'PHOTO',
  gps: 'GEOLOCATION',
  geolocation: 'GEOLOCATION',
  file: 'FILE',
};

export function mapAiTypeToDB(aiType: string): string {
  return AI_TYPE_TO_DB[aiType?.toLowerCase()] ?? 'TEXT';
}

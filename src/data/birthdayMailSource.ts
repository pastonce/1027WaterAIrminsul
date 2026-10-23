export const BIRTHDAY_YEARS = [2023, 2024, 2025, 2026] as const;

export interface BirthdayLetter {
  year: number;
  title: string;
  mail: string[];
  reply: string[];
  pending: boolean;
}

export function parseBirthdayMail(source: string): BirthdayLetter[] {
  const sections = [...source.replaceAll('\r\n', '\n').matchAll(/^# (\d{2})\s*\n([\s\S]*?)(?=^# \d{2}\s*$|(?![\s\S]))/gm)];
  if (sections.length !== BIRTHDAY_YEARS.length) throw new Error('生日来信必须包含四个年份');
  return BIRTHDAY_YEARS.map((year) => {
    const matches = sections.filter((section) => Number(section[1]) + 2000 === year);
    if (matches.length !== 1) throw new Error(`生日来信年份缺失或重复：${year}`);
    const section = matches[0][2];
    const mailSection = section.match(/^## 生日邮件\s*\n([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1];
    const replySection = section.match(/^## 贺图回复\s*\n([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1];
    if (mailSection === undefined || replySection === undefined) throw new Error(`生日来信章节缺失：${year}`);
    const paragraphs = (text: string) => {
      const block = text.match(/```[^\n]*\n([\s\S]*?)```/);
      if (!block) throw new Error(`生日来信正文代码块缺失：${year}`);
      return block[1].split('\n').map((line) => line.trim()).filter(Boolean);
    };
    const title = mailSection.match(/标题：\s*\*\*([^\n]*?)\*\*/)?.[1].trim() ?? '';
    const mail = paragraphs(mailSection);
    const reply = paragraphs(replySection);
    return { year, title, mail, reply, pending: !title && !mail.length && !reply.length };
  });
}

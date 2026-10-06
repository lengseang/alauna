import { readFileSync } from 'node:fs';

export async function pushToNotion(filePath = './docs/ARCHITECTURE.md') {
  const apiKey = process.env.NOTION_API_KEY;
  const pageId = process.env.NOTION_PAGE_ID;

  if (!apiKey || !pageId) {
    throw new Error('Missing NOTION_API_KEY or NOTION_PAGE_ID environment variable.');
  }

  const raw = readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n').filter(Boolean);

  // Convert markdown lines into Notion blocks
  const children = lines.map(line => {
    if (line.startsWith('# ')) {
      return {
        object: 'block',
        type: 'heading_1',
        heading_1: { rich_text: [{ type: 'text', text: { content: line.replace('# ', '') } }] }
      };
    }
    if (line.startsWith('## ')) {
      return {
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: [{ type: 'text', text: { content: line.replace('## ', '') } }] }
      };
    }
    return {
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: [{ type: 'text', text: { content: line } }] }
    };
  });

  const res = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ children: children.slice(0, 100) })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Notion API error (${res.status}): ${err}`);
  }

  return res.json();
}

if (process.argv[1]?.endsWith('sync-notion.js')) {
  pushToNotion()
    .then(() => console.log('Synced architecture doc to Notion.'))
    .catch(err => {
      console.error(err.message);
      process.exit(1);
    });
}

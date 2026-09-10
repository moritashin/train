/* ============================================
   参考视图 — 执行规则 / 食材替换 / 每周采购
   ============================================ */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

export function renderReference(container, ctx) {
  const { plan } = ctx;
  container.replaceChildren();

  if (plan.rules.items.length) {
    container.appendChild(renderRules(plan.rules));
  }

  if (plan.refGroups.length) {
    const section = el('section', 'ref-section');
    section.appendChild(renderSectionHeading('食材替换参考'));
    for (const group of plan.refGroups) {
      section.appendChild(renderGroup(group));
    }
    container.appendChild(section);
  }

  if (plan.shoppingGroups.length) {
    const section = el('section', 'ref-section');
    section.appendChild(renderSectionHeading('每周采购表'));
    for (const group of plan.shoppingGroups) {
      section.appendChild(renderGroup(group));
    }
    container.appendChild(section);
  }

  if (!container.children.length) {
    const placeholder = el('div', 'view-placeholder');
    placeholder.appendChild(el('p', null, '计划表中没有附加的参考内容。'));
    container.appendChild(placeholder);
  }
}

function renderSectionHeading(text) {
  const heading = el('div', 'section-heading');
  heading.appendChild(el('h2', null, text));
  return heading;
}

function renderRules(rules) {
  const section = el('section', 'ref-section');
  section.appendChild(renderSectionHeading('执行规则'));
  const list = el('ol', 'rule-list');
  for (const item of rules.items) {
    list.appendChild(el('li', null, item));
  }
  section.appendChild(list);
  return section;
}

function renderGroup(group) {
  const card = el('div', 'ref-group');
  if (group.title) {
    card.appendChild(el('h3', 'ref-group-title', group.title));
  }
  const body = el('dl', 'ref-group-body');
  for (const row of group.rows) {
    const kv = el('div', 'ref-kv');
    kv.appendChild(el('dt', null, row.label));
    kv.appendChild(el('dd', null, row.value));
    body.appendChild(kv);
  }
  card.appendChild(body);
  return card;
}

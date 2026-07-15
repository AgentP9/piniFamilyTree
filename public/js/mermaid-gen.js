/**
 * mermaid-gen.js — converts family tree data into a Mermaid flowchart string.
 *
 * Output format matches the example from the issue:
 *   flowchart TD
 *     PersonA["Alice"]
 *     Pair1((⚭))
 *     PersonA --- Pair1
 *     Pair1 --> Child1["Bob"]
 */

const MermaidGen = (() => {
  /** Convert a UUID to a safe Mermaid node identifier. */
  function nodeId(id) {
    return 'n' + id.replace(/-/g, '');
  }

  /**
   * Escape special characters inside Mermaid label strings.
   * Double-quotes and some characters break the syntax.
   */
  function escapeLabel(str) {
    return str.replace(/"/g, '&quot;').replace(/[<>]/g, (c) => (c === '<' ? '&lt;' : '&gt;'));
  }

  /**
   * Build the complete Mermaid flowchart code from the data object.
   * @param {{ persons: Array, couples: Array }} data
   * @returns {string}
   */
  function generate(data) {
    const { persons, couples } = data;
    const siblingGroups = data.siblingGroups || [];
    if (persons.length === 0) return '';

    const personMap = new Map(persons.map((p) => [p.id, p]));
    const lines = ['flowchart TD'];

    // ── person nodes ──────────────────────────────────────────
    persons.forEach((p) => {
      const nid = nodeId(p.id);
      const label = escapeLabel(p.name);
      lines.push(`    ${nid}["${label}"]`);
    });

    // ── gender class definitions ──────────────────────────────
    const maleIds   = persons.filter((p) => p.gender === 'male').map((p) => nodeId(p.id));
    const femaleIds = persons.filter((p) => p.gender === 'female').map((p) => nodeId(p.id));

    if (maleIds.length > 0 || femaleIds.length > 0) {
      lines.push('');
      lines.push('    classDef male    fill:#1a3a4a,stroke:#4fc3f7,color:#cceeff');
      lines.push('    classDef female  fill:#3a1a2a,stroke:#f48fb1,color:#ffe0ee');
      lines.push('    classDef pair    fill:#1a1a3a,stroke:#6c63ff,color:#ccccff,shape:circle');
      lines.push('    classDef sibling fill:#2a1a3a,stroke:#a855f7,color:#e9d5ff');
    }

    if (maleIds.length > 0)   lines.push(`    class ${maleIds.join(',')} male`);
    if (femaleIds.length > 0) lines.push(`    class ${femaleIds.join(',')} female`);

    // ── couple nodes & edges ──────────────────────────────────
    if (couples.length > 0) lines.push('');

    couples.forEach((couple, i) => {
      const pairNid = `Pair${i + 1}`;
      const p1 = personMap.get(couple.person1Id);
      const p2 = personMap.get(couple.person2Id);
      if (!p1 || !p2) return;

      lines.push(`    ${pairNid}((⚭))`);
      lines.push(`    ${nodeId(p1.id)} --- ${pairNid} --- ${nodeId(p2.id)}`);

      const validChildren = (couple.childIds || [])
        .map((cid) => personMap.get(cid))
        .filter(Boolean);

      if (validChildren.length > 0) {
        validChildren.forEach((child) => {
          lines.push(`    ${pairNid} --> ${nodeId(child.id)}`);
        });
      } else {
        // NN (No-Name) placeholder matches the format from the project spec:
        // "Pair1 --> NN1["?"]" — shown when a couple has no registered children yet.
        lines.push(`    ${pairNid} --> NN${i + 1}["?"]`);
      }

      lines.push('');
    });

    // ── sibling-group nodes & edges ───────────────────────────
    const validSibNids = [];
    siblingGroups.forEach((group, i) => {
      const sibNid = `SibGroup${i + 1}`;
      const validMembers = (group.personIds || [])
        .map((id) => personMap.get(id))
        .filter(Boolean);

      if (validMembers.length < 2) return;

      validSibNids.push(sibNid);
      lines.push(`    ${sibNid}{{"👥"}}`);
      validMembers.forEach((member) => {
        lines.push(`    ${nodeId(member.id)} -.- ${sibNid}`);
      });
      lines.push('');
    });

    if (validSibNids.length > 0) {
      lines.push(`    class ${validSibNids.join(',')} sibling`);
      lines.push('');
    }

    return lines.join('\n');
  }

  return { generate };
})();

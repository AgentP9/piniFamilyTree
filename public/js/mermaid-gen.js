/**
 * mermaid-gen.js — converts family tree data into a Mermaid flowchart string.
 *
 * Layout strategy:
 *   - Each couple where both partners are newly introduced is wrapped in a
 *     `subgraph` with `direction LR` (and styled transparent) so the two
 *     partners always appear side-by-side on the same horizontal line.
 *   - When a person already appears in an earlier couple, a plain edge is
 *     used instead (subgraph membership cannot be shared across subgraphs).
 *   - Children and sibling-group nodes flow downward from their parent nodes.
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
   * @param {{ persons: Array, couples: Array, siblingGroups?: Array }} data
   * @returns {string}
   */
  function generate(data) {
    const { persons, couples } = data;
    const siblingGroups = data.siblingGroups || [];
    if (persons.length === 0) return '';

    const personMap = new Map(persons.map((p) => [p.id, p]));
    const lines = ['flowchart TD'];

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

    // Track which person IDs have already been given a labelled declaration
    // so we reference them by ID alone on subsequent appearances.
    const declaredPersons = new Set();

    /**
     * Return a Mermaid node token for person p.
     * First occurrence: `nXXX["Name"]`  — declares the node with its label.
     * Later occurrences: `nXXX`         — references the already-declared node.
     */
    function personToken(p) {
      const nid = nodeId(p.id);
      if (declaredPersons.has(p.id)) return nid;
      declaredPersons.add(p.id);
      return `${nid}["${escapeLabel(p.name)}"]`;
    }

    // ── couple subgraphs & edges ──────────────────────────────
    if (couples.length > 0) lines.push('');

    couples.forEach((couple, i) => {
      const pairNid = `Pair${i + 1}`;
      const p1 = personMap.get(couple.person1Id);
      const p2 = personMap.get(couple.person2Id);
      if (!p1 || !p2) return;

      // Capture the layout decision BEFORE personToken() mutates declaredPersons,
      // then pre-compute the tokens (which marks each person as declared).
      const bothNew = !declaredPersons.has(p1.id) && !declaredPersons.has(p2.id);
      const token1 = personToken(p1);
      const token2 = personToken(p2);

      if (bothNew) {
        // Wrap the couple in a subgraph with LR direction so the two partners
        // are rendered side-by-side on the same horizontal line.
        // The pair node is declared inline inside the subgraph so Mermaid
        // includes it in the LR layout; plain `${pairNid}` would leave it
        // undefined outside the subgraph and break the LR placement.
        const sgNid = `sg${i + 1}`;
        lines.push(`    subgraph ${sgNid}[" "]`);
        lines.push(`        direction LR`);
        lines.push(`        ${token1} --- ${pairNid}((⚭)) --- ${token2}`);
        lines.push(`    end`);
        // Remove the subgraph border so it doesn't add visual clutter.
        lines.push(`    style ${sgNid} fill:transparent,stroke:transparent`);
      } else {
        // At least one partner is already placed — fall back to plain edges.
        // The pair node is declared as a separate line here (not inside a
        // subgraph) so its shape is still applied correctly.
        lines.push(`    ${pairNid}((⚭))`);
        lines.push(`    ${token1} --- ${pairNid} --- ${token2}`);
      }

      const validChildren = (couple.childIds || [])
        .map((cid) => personMap.get(cid))
        .filter(Boolean);

      if (validChildren.length > 0) {
        validChildren.forEach((child) => {
          lines.push(`    ${pairNid} --> ${personToken(child)}`);
        });
      } else {
        // NN (No-Name) placeholder — shown when a couple has no registered children yet.
        lines.push(`    ${pairNid} --> NN${i + 1}["?"]`);
      }

      lines.push('');
    });

    // ── standalone persons (not part of any couple) ───────────
    persons.forEach((p) => {
      if (!declaredPersons.has(p.id)) {
        lines.push(`    ${nodeId(p.id)}["${escapeLabel(p.name)}"]`);
        declaredPersons.add(p.id);
      }
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

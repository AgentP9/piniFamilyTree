/**
 * cytoscape-gen.js — converts family tree data into Cytoscape elements.
 */

const CytoscapeGen = (() => {
  function safeSuffix(value) {
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  function nodeId(id) {
    return `person:${id}`;
  }

  function pairNodeId(id) {
    return `couple:${safeSuffix(id)}`;
  }

  function siblingNodeId(id, index) {
    return `sibling:${safeSuffix(id || `fallback-${index + 1}`)}`;
  }

  function placeholderNodeId(coupleId, index) {
    return `placeholder:${safeSuffix(coupleId || `fallback-${index + 1}`)}`;
  }

  function edgeId(prefix, source, target) {
    return `${prefix}:${safeSuffix(source)}:${safeSuffix(target)}`;
  }

  function generate(data) {
    const persons = Array.isArray(data?.persons) ? data.persons : [];
    const couples = Array.isArray(data?.couples) ? data.couples : [];
    const siblingGroups = Array.isArray(data?.siblingGroups) ? data.siblingGroups : [];

    if (persons.length === 0) {
      return { elements: [], code: '' };
    }

    const personMap = new Map(persons.map((person) => [person.id, person]));
    const elements = [];

    persons.forEach((person) => {
      elements.push({
        group: 'nodes',
        data: {
          id: nodeId(person.id),
          label: person.name,
          kind: 'person',
          gender: person.gender,
          personId: person.id
        }
      });
    });

    couples.forEach((couple, index) => {
      const person1 = personMap.get(couple.person1Id);
      const person2 = personMap.get(couple.person2Id);
      if (!person1 || !person2) return;

      const pairId = pairNodeId(couple.id || `fallback-${index + 1}`);
      elements.push({
        group: 'nodes',
        data: {
          id: pairId,
          label: '⚭',
          kind: 'couple',
          coupleId: couple.id
        }
      });

      elements.push({
        group: 'edges',
        data: {
          id: edgeId('partner', nodeId(person1.id), pairId),
          source: nodeId(person1.id),
          target: pairId,
          kind: 'partner'
        }
      });
      elements.push({
        group: 'edges',
        data: {
          id: edgeId('partner', nodeId(person2.id), pairId),
          source: nodeId(person2.id),
          target: pairId,
          kind: 'partner'
        }
      });

      const validChildren = (couple.childIds || [])
        .map((childId) => personMap.get(childId))
        .filter(Boolean);

      if (validChildren.length > 0) {
        validChildren.forEach((child) => {
          elements.push({
            group: 'edges',
            data: {
              id: edgeId('child', pairId, nodeId(child.id)),
              source: pairId,
              target: nodeId(child.id),
              kind: 'child'
            }
          });
        });
      } else {
        const placeholderId = placeholderNodeId(couple.id, index);
        elements.push({
          group: 'nodes',
          data: {
            id: placeholderId,
            label: '?',
            kind: 'placeholder'
          }
        });
        elements.push({
          group: 'edges',
          data: {
            id: edgeId('child', pairId, placeholderId),
            source: pairId,
            target: placeholderId,
            kind: 'child'
          }
        });
      }
    });

    siblingGroups.forEach((group, index) => {
      const validMembers = (group.personIds || [])
        .map((personId) => personMap.get(personId))
        .filter(Boolean);

      if (validMembers.length < 2) return;

      const hubId = siblingNodeId(group.id, index);
      elements.push({
        group: 'nodes',
        data: {
          id: hubId,
          label: '👥',
          kind: 'siblingGroup',
          siblingGroupId: group.id
        }
      });

      validMembers.forEach((member) => {
        elements.push({
          group: 'edges',
          data: {
            id: edgeId('sibling', nodeId(member.id), hubId),
            source: nodeId(member.id),
            target: hubId,
            kind: 'sibling'
          }
        });
      });
    });

    return {
      elements,
      code: JSON.stringify({ elements }, null, 2)
    };
  }

  return { generate, nodeId, pairNodeId };
})();

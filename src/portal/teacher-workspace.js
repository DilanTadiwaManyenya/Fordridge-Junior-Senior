const normalize = (value) => String(value ?? '').trim().toLowerCase()

export function canOpenTeacherMyClass(role, hasClassAssignment) {
  return role === 'teacher' && hasClassAssignment === true
}

export function buildTeacherClassScopes(assignments = [], learners = []) {
  const groups = new Map()

  for (const assignment of assignments) {
    if (assignment.assignment_kind !== 'class') continue
    const classLevel = normalize(assignment.class_level)
    if (!classLevel || !assignment.campus_id) continue
    const classStream = normalize(assignment.class_stream)
    const key = [assignment.campus_id, classLevel, classStream || '*'].join(':')
    const group = groups.get(key) || {
      key,
      campus_id: assignment.campus_id,
      campus_name: assignment.campus?.name || 'Campus to be confirmed',
      class_level: assignment.class_level,
      class_stream: assignment.class_stream || null,
      subjects: new Set(),
    }
    if (assignment.subject?.trim()) group.subjects.add(assignment.subject.trim())
    groups.set(key, group)
  }

  return [...groups.values()].map((group) => ({
    ...group,
    subjects: [...group.subjects].sort((a, b) => a.localeCompare(b)),
    learners: learners
      .filter((learner) =>
        learner.campus_id === group.campus_id &&
        normalize(learner.class_level) === normalize(group.class_level) &&
        (!normalize(group.class_stream) ||
          normalize(learner.class_stream) === normalize(group.class_stream)),
      )
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '')),
  }))
}

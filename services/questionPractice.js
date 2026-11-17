'use strict';
const { canUseSet, currentContentReview } = require('./questionBankRights');
const { problem, shanghaiDate } = require('./questionAssetRights');

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const strict = (value, allowed, code) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !allowed.includes(key))) throw problem(code);
};
const positive = value => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw problem('INVALID_ID');
  return number;
};
const text = (value, code) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 100) throw problem(code);
  return value.trim();
};
const pagination = input => {
  const cursor = input.cursor === undefined ? 0 : Number(input.cursor);
  const limit = input.limit === undefined ? 30 : Number(input.limit);
  if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw problem('INVALID_PAGINATION');
  return { cursor, limit };
};
const parse = value => { try { return JSON.parse(value); } catch (_) { return null; } };

function createQuestionPractice(db, options = {}) {
  const clock = options.clock || (() => new Date());
  const at = () => shanghaiDate(clock());
  const assertUser = value => {
    const userId = positive(value);
    if (!db.prepare('SELECT 1 FROM users WHERE id=?').get(userId)) throw problem('USER_NOT_FOUND', 401);
    return userId;
  };
  const set = value => db.prepare('SELECT * FROM qb_sets WHERE id=?').get(positive(value));
  const snapshot = (sessionId, position) => db.prepare(`SELECT item.position,item.revision_id,revision.content_json
    FROM qb_practice_items item JOIN qb_revisions revision ON revision.id=item.revision_id
    WHERE item.session_id=? AND item.position=?`).get(sessionId, positive(position));
  const currentSession = (id, userId) => {
    const row = db.prepare('SELECT * FROM qb_practice_sessions WHERE id=? AND user_id=?').get(positive(id), assertUser(userId));
    if (!row) throw problem('SESSION_NOT_FOUND', 404);
    return row;
  };
  const sessionView = row => {
    const counts = db.prepare(`SELECT (SELECT COUNT(*) FROM qb_practice_items WHERE session_id=?) total,
      (SELECT COUNT(*) FROM qb_practice_answers WHERE session_id=?) answered,
      (SELECT COUNT(*) FROM qb_practice_answers WHERE session_id=? AND is_correct=1) correct_count`).get(row.id,row.id,row.id);
    return { id: row.id, setId: row.set_id, setTitle: row.set_title, status: row.status,
      total: counts.total, answered: counts.answered, correctCount: counts.correct_count,
      createdAt: row.created_at, completedAt: row.completed_at };
  };
  const isGlobalClaim = (table, field, id, needed, excluded, day) =>
    db.prepare(`SELECT rights_json,territories_json,submitted_by FROM ${table}
      WHERE ${field}=? AND status='approved' AND valid_from<=? AND valid_until>=?`).all(id,day,day)
      .some(row => {
        const rights = parse(row.rights_json), territories = parse(row.territories_json);
        return !excluded.includes(row.submitted_by) && Array.isArray(territories) && territories.length === 1 &&
          territories[0] === '*' && rights && needed.every(key => rights[key] === true);
      });
  const rightsReady = row => {
    if (!row || row.status !== 'ready' || row.publish_commercial !== 1 || !/^[A-Z]{2}$/.test(row.publish_territory || '')) return false;
    const context = { territory: row.publish_territory, commercial: true, at: at() };
    if (!canUseSet(db, row.id, context)) return false;
    const items = db.prepare(`SELECT revision.id,revision.provenance_json
      FROM qb_set_items item JOIN qb_revisions revision ON revision.id=item.revision_id
      WHERE item.set_id=? ORDER BY item.position`).all(row.id);
    if (!items.length) return false;
    return items.every(item => {
      const review = currentContentReview(db, item.id), provenance = parse(item.provenance_json);
      if (!review || review.decision !== 'approved' || !provenance) return false;
      const needed = ['stemDisplay','answerDisplay','commercialUse'];
      if (provenance.kind === 'pdf') needed.push('adaptation');
      if (!isGlobalClaim('qb_right_claims','revision_id',item.id,needed,[review.reviewer],context.at)) return false;
      if (provenance.kind !== 'pdf') return provenance.kind === 'original';
      const sourceReview = db.prepare(`SELECT reviewer,decision FROM question_asset_content_reviews
        WHERE source_id=? ORDER BY id DESC LIMIT 1`).get(provenance.sourceId);
      return sourceReview?.decision === 'approved' &&
        isGlobalClaim('question_asset_right_claims','source_id',provenance.sourceId,
          ['stemDisplay','answerDisplay','adaptation','commercialUse'],
          [review.reviewer,sourceReview.reviewer],context.at);
    });
  };
  const publicSetReady = row => Boolean(row && db.prepare('SELECT enabled FROM qb_free_web_publications WHERE set_id=?').pluck().get(row.id) === 1) && rightsReady(row);
  const assertAvailable = row => {
    if (!publicSetReady(row)) throw problem('QUESTION_UNAVAILABLE', 403);
  };
  const questionView = item => {
    const content = parse(item.content_json);
    if (!content || !['single','multiple','boolean'].includes(content.type)) throw problem('QUESTION_UNAVAILABLE', 403);
    const question = { position: item.position, revisionId: item.revision_id,
      type: content.type, stem: content.stem };
    if (content.type !== 'boolean') question.options = content.options.map(option => ({ id: option.id, text: option.text }));
    return question;
  };
  const answerFor = (content, value) => {
    if (value === null) return null;
    if (content.type === 'boolean') {
      if (typeof value !== 'boolean') throw problem('INVALID_ANSWER');
      return value;
    }
    if (!Array.isArray(value) || value.length < 1 || (content.type === 'single' && value.length > 1) ||
        value.length > content.options.length || new Set(value).size !== value.length ||
        value.some(choice => typeof choice !== 'string' || !content.options.some(option => option.id === choice)))
      throw problem('INVALID_ANSWER');
    return [...value].sort();
  };
  const score = (content, selected) => selected === null ? false : content.type === 'boolean' ? selected === content.answer :
    selected.length > 0 && JSON.stringify(selected) === JSON.stringify([...content.answer].sort());
  const resultView = (item, answerRow) => {
    const content = parse(item.content_json);
    return { position: item.position, selectedAnswer: parse(answerRow.selected_json),
      isCorrect: Boolean(answerRow.is_correct), correctAnswer: content.answer,
      explanation: content.explanation, submittedAt: answerRow.submitted_at };
  };
  const itemFor = (sessionId, position, userId, enforceRights = true) => {
    const session = currentSession(sessionId, userId);
    const item = snapshot(session.id, position);
    if (!item) throw problem('QUESTION_NOT_FOUND', 404);
    if (enforceRights) assertAvailable(set(session.set_id));
    return { session, item };
  };
  const answerRow = (sessionId, position) => db.prepare('SELECT * FROM qb_practice_answers WHERE session_id=? AND position=?').get(sessionId,position);
  const assertInSequence = (session,item) => {
    if (answerRow(session.id,item.position)) return;
    if (session.status !== 'active') throw problem('SESSION_FINISHED',409);
    const next = db.prepare(`SELECT MIN(item.position) FROM qb_practice_items item
      WHERE item.session_id=? AND NOT EXISTS(SELECT 1 FROM qb_practice_answers answer
        WHERE answer.session_id=item.session_id AND answer.position=item.position)`).pluck().get(session.id);
    if (item.position !== next) throw problem('QUESTION_NOT_YET_AVAILABLE',409);
  };
  const availableRecord = (session, item, answer = null) => {
    const available = publicSetReady(set(session.set_id));
    return { available, ...(available ? { question: questionView(item), ...(answer ? { submission: resultView(item,answer) } : {}) } : {}) };
  };
  return {
    publicSetReady,
    publication(setId) {
      const row = set(setId);
      if (!row) throw problem('SET_NOT_FOUND',404);
      const publication = db.prepare('SELECT * FROM qb_free_web_publications WHERE set_id=?').get(row.id);
      const enabled = Boolean(publication?.enabled), effectiveAvailable = enabled && rightsReady(row);
      return { setId:row.id,enabled:Boolean(publication?.enabled),version:publication?.version || 0,
        changedBy:publication?.changed_by || null,changedAt:publication?.changed_at || null,
        effectiveAvailable, availabilityReason:effectiveAvailable ? null : enabled ? 'PUBLIC_RIGHTS_UNAVAILABLE' : 'NOT_ENABLED' };
    },
    setPublication(setId,input,actor) {
      strict(input,['clientKey','enabled','expectedVersion'],'INVALID_PUBLICATION_REQUEST');
      const clientKey = text(input.clientKey,'INVALID_CLIENT_KEY');
      if (typeof input.enabled !== 'boolean' || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0)
        throw problem('INVALID_PUBLICATION_REQUEST');
      const who = text(actor,'INVALID_ACTOR');
      return db.transaction(() => {
        const row = set(setId);
        if (!row) throw problem('SET_NOT_FOUND',404);
        const prior = db.prepare('SELECT * FROM qb_free_web_publication_events WHERE set_id=? AND client_key=?').get(row.id,clientKey);
        if (prior) {
          if (prior.enabled !== Number(input.enabled) || prior.expected_version !== input.expectedVersion || prior.actor !== who)
            throw problem('CLIENT_KEY_CONFLICT',409);
          return { publication:this.publication(row.id) };
        }
        const old = db.prepare('SELECT * FROM qb_free_web_publications WHERE set_id=?').get(row.id);
        if ((old?.version || 0) !== input.expectedVersion) throw problem('PUBLICATION_VERSION_CONFLICT',409);
        if (input.enabled && !rightsReady(row)) throw problem('QUESTION_UNAVAILABLE',409);
        if (!old) db.prepare('INSERT INTO qb_free_web_publications(set_id,enabled,version,changed_by) VALUES (?,?,1,?)')
          .run(row.id,Number(input.enabled),who);
        else db.prepare("UPDATE qb_free_web_publications SET enabled=?,version=version+1,changed_by=?,changed_at=datetime('now') WHERE set_id=?")
          .run(Number(input.enabled),who,row.id);
        db.prepare('INSERT INTO qb_free_web_publication_events(set_id,client_key,expected_version,enabled,actor) VALUES (?,?,?,?,?)')
          .run(row.id,clientKey,input.expectedVersion,Number(input.enabled),who);
        return { publication:this.publication(row.id) };
      })();
    },
    listSets(input = {}, userId) {
      assertUser(userId);
      const { cursor,limit } = pagination(input);
      const eligible = db.prepare(`SELECT sets.* FROM qb_sets sets
        JOIN qb_free_web_publications publication ON publication.set_id=sets.id AND publication.enabled=1
        WHERE sets.status='ready' AND sets.publish_commercial=1 ORDER BY sets.id`).all()
        .filter(publicSetReady);
      const after = eligible.filter(row => row.id > cursor), rows = after.slice(0,limit);
      return { sets: rows.map(row => ({ id: row.id, title: row.title,
        questionCount: db.prepare('SELECT COUNT(*) FROM qb_set_items WHERE set_id=?').pluck().get(row.id) })),
      total: eligible.length, nextCursor: after.length > limit ? rows.at(-1).id : null };
    },
    start(setId, input, userId) {
      strict(input,['clientKey'],'INVALID_START_REQUEST');
      const clientKey = text(input.clientKey,'INVALID_CLIENT_KEY'), owner = assertUser(userId);
      return db.transaction(() => {
        const target = set(setId);
        assertAvailable(target);
        const old = db.prepare('SELECT * FROM qb_practice_sessions WHERE user_id=? AND client_key=?').get(owner,clientKey);
        if (old) {
          if (old.set_id !== target.id) throw problem('CLIENT_KEY_CONFLICT',409);
          return { session: sessionView(old) };
        }
        const active = db.prepare("SELECT * FROM qb_practice_sessions WHERE user_id=? AND set_id=? AND status='active'").get(owner,target.id);
        if (active) return { session: sessionView(active) };
        const id = db.prepare('INSERT INTO qb_practice_sessions(user_id,set_id,client_key,set_title) VALUES (?,?,?,?)')
          .run(owner,target.id,clientKey,target.title).lastInsertRowid;
        db.prepare('INSERT INTO qb_practice_snapshot_permits(session_id) VALUES (?)').run(id);
        const insert = db.prepare('INSERT INTO qb_practice_items(session_id,position,revision_id) VALUES (?,?,?)');
        db.prepare('SELECT position,revision_id FROM qb_set_items WHERE set_id=? ORDER BY position').all(target.id)
          .forEach(item => insert.run(id,item.position,item.revision_id));
        db.prepare('DELETE FROM qb_practice_snapshot_permits WHERE session_id=?').run(id);
        return { session: sessionView(db.prepare('SELECT * FROM qb_practice_sessions WHERE id=?').get(id)) };
      })();
    },
    listSessions(input = {}, userId) {
      const owner = assertUser(userId), { cursor,limit } = pagination(input);
      const status = input.status === undefined ? null : input.status;
      if (status !== null && !['active','finished'].includes(status)) throw problem('INVALID_STATUS');
      const where = status ? ' AND status=?' : '';
      const args = status ? [owner,cursor,status,limit+1] : [owner,cursor,limit+1];
      const rows = db.prepare(`SELECT * FROM qb_practice_sessions WHERE user_id=? AND id>?${where} ORDER BY id LIMIT ?`).all(...args);
      const total = status ? db.prepare('SELECT COUNT(*) FROM qb_practice_sessions WHERE user_id=? AND status=?').pluck().get(owner,status) :
        db.prepare('SELECT COUNT(*) FROM qb_practice_sessions WHERE user_id=?').pluck().get(owner);
      const sessions = rows.slice(0,limit).map(sessionView);
      return { sessions,total,nextCursor: rows.length>limit ? sessions.at(-1).id : null };
    },
    sessionDetail(sessionId,userId) {
      const session = currentSession(sessionId,userId);
      const items = db.prepare(`SELECT item.position,item.revision_id,answer.is_correct,answer.id answer_id,
        favorite.user_id favorite_user_id FROM qb_practice_items item
        LEFT JOIN qb_practice_answers answer ON answer.session_id=item.session_id AND answer.position=item.position
        LEFT JOIN qb_practice_favorites favorite ON favorite.session_id=item.session_id AND favorite.position=item.position AND favorite.user_id=?
        WHERE item.session_id=? ORDER BY item.position`).all(session.user_id,session.id)
        .map(row => ({ position: row.position, revisionId: row.revision_id,
          answered: row.answer_id !== null, isCorrect: row.answer_id === null ? null : Boolean(row.is_correct),
          favorite: row.favorite_user_id !== null }));
      return { session: sessionView(session),items };
    },
    report(sessionId,userId) {
      const session = currentSession(sessionId,userId);
      const rows = db.prepare(`SELECT revision.content_json,answer.id answer_id,
        answer.selected_json,answer.is_correct FROM qb_practice_items item
        JOIN qb_revisions revision ON revision.id=item.revision_id
        LEFT JOIN qb_practice_answers answer ON answer.session_id=item.session_id AND answer.position=item.position
        WHERE item.session_id=? ORDER BY item.position`).all(session.id);
      const types = { single:'单选',multiple:'多选',boolean:'判断' };
      const byType = Object.keys(types).map(type => ({ type,label:types[type],total:0,answered:0,correct:0,incorrect:0,skipped:0 }));
      for (const row of rows) {
        const type = parse(row.content_json)?.type;
        const group = byType.find(item => item.type === type);
        if (!group) throw problem('QUESTION_UNAVAILABLE',403);
        group.total += 1;
        if (row.answer_id === null) continue;
        group.answered += 1;
        if (row.is_correct) group.correct += 1;
        else group.incorrect += 1;
        if (row.selected_json === 'null') group.skipped += 1;
      }
      const visible = byType.filter(item => item.total).map(item => ({ ...item,
        accuracyPercent:item.answered ? Math.round(item.correct / item.answered * 100) : 0 }));
      const answered = visible.reduce((sum,item) => sum + item.answered,0);
      const correct = visible.reduce((sum,item) => sum + item.correct,0);
      const incorrect = answered - correct;
      const skipped = visible.reduce((sum,item) => sum + item.skipped,0);
      const focus = [...visible].sort((left,right) => right.incorrect - left.incorrect)[0];
      return { report:{ sessionId:session.id,status:session.status,total:rows.length,
        answered,correct,incorrect,skipped,unanswered:rows.length-answered,
        accuracyPercent:answered ? Math.round(correct / answered * 100) : 0,
        byType:visible,focusType:focus && focus.incorrect ? focus.label : null } };
    },
    question(sessionId,position,userId) {
      const { session,item } = itemFor(sessionId,position,userId);
      assertInSequence(session,item);
      return { question: questionView(item) };
    },
    submit(sessionId,position,input,userId) {
      strict(input,['requestId','answer'],'INVALID_SUBMIT_REQUEST');
      if (!own(input,'answer')) throw problem('ANSWER_REQUIRED');
      const requestId = text(input.requestId,'INVALID_REQUEST_ID');
      return db.transaction(() => {
        const { session,item } = itemFor(sessionId,position,userId);
        assertInSequence(session,item);
        const content = parse(item.content_json), selected = answerFor(content,input.answer);
        const existingKey = db.prepare('SELECT * FROM qb_practice_answers WHERE session_id=? AND request_id=?').get(session.id,requestId);
        if (existingKey) {
          if (existingKey.position !== item.position || existingKey.selected_json !== JSON.stringify(selected))
            throw problem('REQUEST_ID_CONFLICT',409);
          return { submission: resultView(item,existingKey) };
        }
        if (session.status !== 'active') throw problem('SESSION_FINISHED',409);
        if (answerRow(session.id,item.position)) throw problem('QUESTION_ALREADY_SUBMITTED',409);
        const correct = score(content,selected);
        db.prepare(`INSERT INTO qb_practice_answers(session_id,position,request_id,selected_json,is_correct)
          VALUES (?,?,?,?,?)`).run(session.id,item.position,requestId,JSON.stringify(selected),Number(correct));
        return { submission: resultView(item,answerRow(session.id,item.position)) };
      })();
    },
    result(sessionId,position,userId) {
      const { session,item } = itemFor(sessionId,position,userId);
      const answer = answerRow(session.id,item.position);
      if (!answer) throw problem('QUESTION_NOT_SUBMITTED',409);
      return { submission: resultView(item,answer) };
    },
    finish(sessionId,userId) {
      return db.transaction(() => {
        const session = currentSession(sessionId,userId);
        if (session.status === 'active') db.prepare("UPDATE qb_practice_sessions SET status='finished',completed_at=datetime('now') WHERE id=? AND status='active'").run(session.id);
        return { session: sessionView(currentSession(session.id,userId)) };
      })();
    },
    setFavorite(sessionId,position,userId,favorite) {
      return db.transaction(() => {
        const { session,item } = itemFor(sessionId,position,userId,!(!favorite));
        if (favorite) assertInSequence(session,item);
        if (favorite) db.prepare('INSERT OR IGNORE INTO qb_practice_favorites(user_id,session_id,position) VALUES (?,?,?)')
          .run(session.user_id,session.id,item.position);
        else db.prepare('DELETE FROM qb_practice_favorites WHERE user_id=? AND session_id=? AND position=?')
          .run(session.user_id,session.id,item.position);
        return { favorite: Boolean(favorite),available:publicSetReady(set(session.set_id)) };
      })();
    },
    mistakes(input = {},userId) {
      const owner = assertUser(userId), { cursor,limit } = pagination(input);
      const rows = db.prepare(`SELECT answer.id cursor_id,answer.*,session.set_id,session.set_title,
        item.revision_id,revision.content_json FROM qb_practice_answers answer
        JOIN qb_practice_sessions session ON session.id=answer.session_id
        JOIN qb_practice_items item ON item.session_id=answer.session_id AND item.position=answer.position
        JOIN qb_revisions revision ON revision.id=item.revision_id
        WHERE session.user_id=? AND answer.is_correct=0 AND (?=0 OR answer.id<?)
        ORDER BY answer.id DESC LIMIT ?`).all(owner,cursor,cursor,limit+1);
      const mistakes = rows.slice(0,limit).map(row => ({ sessionId: row.session_id,position: row.position,
        revisionId: row.revision_id,submittedAt: row.submitted_at,isCorrect:false,
        ...availableRecord({set_id:row.set_id},{position:row.position,revision_id:row.revision_id,content_json:row.content_json},row) }));
      return { mistakes,total: db.prepare(`SELECT COUNT(*) FROM qb_practice_answers answer
        JOIN qb_practice_sessions session ON session.id=answer.session_id
        WHERE session.user_id=? AND answer.is_correct=0`).pluck().get(owner),
      nextCursor: rows.length>limit ? rows[limit-1].cursor_id : null };
    },
    favorites(input = {},userId) {
      const owner = assertUser(userId), { cursor,limit } = pagination(input);
      const rows = db.prepare(`SELECT favorite.rowid cursor_id,favorite.*,session.set_id,item.revision_id,revision.content_json
        FROM qb_practice_favorites favorite
        JOIN qb_practice_sessions session ON session.id=favorite.session_id AND session.user_id=favorite.user_id
        JOIN qb_practice_items item ON item.session_id=favorite.session_id AND item.position=favorite.position
        JOIN qb_revisions revision ON revision.id=item.revision_id
        WHERE favorite.user_id=? AND (?=0 OR favorite.rowid<?) ORDER BY favorite.rowid DESC LIMIT ?`)
        .all(owner,cursor,cursor,limit+1);
      const favorites = rows.slice(0,limit).map(row => ({ sessionId:row.session_id,position:row.position,
        revisionId:row.revision_id,createdAt:row.created_at,
        ...availableRecord({set_id:row.set_id},{position:row.position,revision_id:row.revision_id,content_json:row.content_json}) }));
      return { favorites,total: db.prepare('SELECT COUNT(*) FROM qb_practice_favorites WHERE user_id=?').pluck().get(owner),
        nextCursor: rows.length>limit ? rows[limit-1].cursor_id : null };
    }
  };
}

module.exports = { createQuestionPractice };

// Hook stdin payloads are arbitrary JSON — the picker must only ever return
// string fields and null out garbage.

import { describe, expect, it } from 'vitest'
import { pickClaudeSessionFields } from '../src/renderer/state/runtime'

describe('pickClaudeSessionFields', () => {
  it('extracts session_id and transcript_path', () => {
    expect(
      pickClaudeSessionFields({
        session_id: 'abc',
        transcript_path: '/home/u/.claude/projects/x/abc.jsonl',
        cwd: '/w',
        hook_event_name: 'Stop'
      })
    ).toEqual({ sessionId: 'abc', transcriptPath: '/home/u/.claude/projects/x/abc.jsonl' })
  })

  it('tolerates partial payloads', () => {
    expect(pickClaudeSessionFields({ session_id: 'abc' })).toEqual({
      sessionId: 'abc',
      transcriptPath: undefined
    })
  })

  it('rejects junk', () => {
    expect(pickClaudeSessionFields(null)).toBeNull()
    expect(pickClaudeSessionFields('string')).toBeNull()
    expect(pickClaudeSessionFields(42)).toBeNull()
    expect(pickClaudeSessionFields({})).toBeNull()
    expect(pickClaudeSessionFields({ session_id: 123, transcript_path: {} })).toBeNull()
  })
})

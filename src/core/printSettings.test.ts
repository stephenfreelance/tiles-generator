import { describe, expect, it } from 'vitest'
import { ELEPHANT_FOOT_NOTE, PART_PRINT_SETTINGS, partPrintNote, PRINT_SETTINGS, settingsSummary } from './printSettings'

describe('print settings', () => {
  it('says every table entry the way its numbers read', () => {
    expect(settingsSummary(PRINT_SETTINGS)).toBe(PRINT_SETTINGS.summary)
    for (const settings of Object.values(PART_PRINT_SETTINGS)) expect(settingsSummary(settings)).toBe(settings.summary)
    expect(PART_PRINT_SETTINGS.key.summary).toBe('0.2 mm layers, 100 % infill')
    expect(PART_PRINT_SETTINGS.clip.summary).toBe('0.2 mm layers, 100 % infill')
  })

  it('lists exactly the part kinds that print: clips, keys and the fit test', () => {
    expect(Object.keys(PART_PRINT_SETTINGS).sort()).toEqual(['clip', 'fit-test', 'key'])
  })

  it('prints the fit test coupon like the tiles it tests', () => {
    expect(PART_PRINT_SETTINGS['fit-test']).toBe(PRINT_SETTINGS)
  })

  it('writes a print note as the way the part lies, then the settings its weight assumes', () => {
    expect(partPrintNote('clip', 'Print flat on its back')).toBe('Print flat on its back: 0.2 mm layers, 100 % infill.')
    expect(partPrintNote('fit-test', 'Print face up')).toBe('Print face up: 0.2 mm layers, 3 walls, 15 % infill.')
    expect(ELEPHANT_FOOT_NOTE).not.toContain(String.fromCharCode(0x2014))
  })
})

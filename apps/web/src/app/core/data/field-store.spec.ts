import { TestBed } from '@angular/core/testing';
import { FieldStore } from './field-store';
import { ProjectsStore } from './projects-store';

describe('FieldStore (AFU M4)', () => {
  let field: FieldStore;
  let projects: ProjectsStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    field = TestBed.inject(FieldStore);
    projects = TestBed.inject(ProjectsStore);
  });

  it('a new visit gets the next progressive number for its project (BR-16)', () => {
    const id = field.start('p1');
    expect(projects.visits().find((v) => v.id === id)?.number).toBe(4);
  });

  it('blocks finalization while AI items still need verification (BR-05)', () => {
    expect(field.blockers('v1')()).toEqual([expect.stringContaining('voce da verificare')]);
    expect(field.finalize('v1')).toBe(false);
  });

  it('editing the flagged item clears the block and finalization freezes the report', () => {
    const flagged = field.detail('v1')().items.find((i) => i.needsVerification);
    expect(flagged).toBeDefined();
    field.updateItem('v1', flagged!.id, 'Si dispone all’impresa di ripristinare lo scarico entro il 25/09/2026.');

    const edited = field.detail('v1')().items.find((i) => i.id === flagged!.id);
    expect(edited).toMatchObject({ needsVerification: false, origin: 'AI_EDITED' });
    expect(field.blockers('v1')()).toEqual([]);

    expect(field.finalize('v1')).toBe(true);
    expect(projects.visits().find((v) => v.id === 'v1')).toMatchObject({ status: 'FINAL', issuesOpen: 1 });
  });

  it('requires the site director among the attendees', () => {
    const id = field.start('p3');
    field.addItem(id, 'PROGRESS');
    field.removeAttendee(id, 'Direttore dei Lavori');
    expect(field.blockers(id)()).toEqual([expect.stringContaining('Direttore dei Lavori')]);
  });

  it('an empty report cannot be finalized', () => {
    const id = field.start('p3');
    expect(field.blockers(id)()).toEqual([expect.stringContaining('almeno una voce')]);
  });
});

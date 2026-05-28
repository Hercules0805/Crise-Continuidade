import * as fc from 'fast-check';
import { v4 as uuidv4 } from 'uuid';
import { DependenciaCrudUseCase } from '../../src/use-cases/crud/DependenciaCrudUseCase';
import { ConfigRespostaCrudUseCase } from '../../src/use-cases/crud/ConfigRespostaCrudUseCase';
import { IDependenciaRepository } from '../../src/use-cases/interfaces/IDependenciaRepository';
import { IConfigRespostaRepository } from '../../src/use-cases/interfaces/IConfigRespostaRepository';
import { Dependencia } from '../../src/domain/entities/Dependencia';
import { ConfigResposta } from '../../src/domain/entities/ConfigResposta';

// In-memory implementations
class InMemoryDependenciaRepository implements IDependenciaRepository {
  private items: Dependencia[] = [];

  async findAll(): Promise<Dependencia[]> { return [...this.items]; }
  async save(dep: Dependencia): Promise<Dependencia> {
    if (!dep.id) dep.id = uuidv4();
    const existing = this.items.findIndex(d => d.id === dep.id);
    if (existing >= 0) this.items[existing] = dep;
    else this.items.push(dep);
    return dep;
  }
  async delete(id: string): Promise<void> {
    this.items = this.items.filter(d => d.id !== id);
  }
}

class InMemoryConfigRespostaRepository implements IConfigRespostaRepository {
  private items: ConfigResposta[] = [];

  async findAll(): Promise<ConfigResposta[]> { return [...this.items]; }
  async findByCategoria(cat: string): Promise<ConfigResposta[]> {
    return this.items.filter(c => c.categoria === cat);
  }
  async save(config: ConfigResposta): Promise<ConfigResposta> {
    if (!config.id) config.id = uuidv4();
    const existing = this.items.findIndex(c => c.id === config.id);
    if (existing >= 0) this.items[existing] = config;
    else this.items.push(config);
    return config;
  }
  async delete(id: string): Promise<void> {
    this.items = this.items.filter(c => c.id !== id);
  }

  // Helper for seeding
  seed(items: ConfigResposta[]): void { this.items = [...items]; }
}

/**
 * Validates: Requirements 11.1, 12.1
 */
describe('Property 14: CRUD Round Trip for Entities', () => {
  it('creating a Dependencia and retrieving it preserves all fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          categoria: fc.stringOf(fc.char(), { minLength: 1, maxLength: 20 }),
          nome: fc.stringOf(fc.char(), { minLength: 1, maxLength: 50 }),
          detalhes: fc.string({ maxLength: 100 }),
          setor: fc.string({ maxLength: 30 }),
          empresa: fc.string({ maxLength: 50 }),
          telefone: fc.string({ maxLength: 20 }),
          email: fc.emailAddress(),
        }),
        async (fields) => {
          const repo = new InMemoryDependenciaRepository();
          const useCase = new DependenciaCrudUseCase(repo);

          const input: Partial<Dependencia> = {
            categoria: fields.categoria,
            nome: fields.nome,
            detalhes: fields.detalhes,
            setor: fields.setor,
            empresa: fields.empresa,
            telefone: fields.telefone,
            email: fields.email,
          };

          const result = await useCase.salvarDependencia(input);
          expect(result.success).toBe(true);
          expect(result.id).toBeDefined();

          const all = await useCase.getDependencias();
          expect(all.length).toBe(1);

          const saved = all[0];
          expect(saved.categoria).toBe(fields.categoria);
          expect(saved.nome).toBe(fields.nome);
          expect(saved.detalhes).toBe(fields.detalhes);
          expect(saved.setor).toBe(fields.setor);
          expect(saved.empresa).toBe(fields.empresa);
          expect(saved.telefone).toBe(fields.telefone);
          expect(saved.email).toBe(fields.email);
          expect(saved.id).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('creating a ConfigResposta and retrieving it preserves all fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          categoria: fc.stringOf(fc.char(), { minLength: 1, maxLength: 20 }),
          valor: fc.stringOf(fc.char16bits(), { minLength: 1, maxLength: 5 }),
          label: fc.stringOf(fc.char(), { minLength: 1, maxLength: 30 }),
          cor: fc.hexaString({ minLength: 6, maxLength: 6 }).map(h => `#${h}`),
          background: fc.hexaString({ minLength: 6, maxLength: 6 }).map(h => `#${h}`),
        }),
        async (fields) => {
          const repo = new InMemoryConfigRespostaRepository();
          const useCase = new ConfigRespostaCrudUseCase(repo);

          const input: Partial<ConfigResposta> = {
            categoria: fields.categoria,
            valor: fields.valor,
            label: fields.label,
            cor: fields.cor,
            background: fields.background,
          };

          const result = await useCase.salvarConfigResposta(input);
          expect(result.success).toBe(true);
          expect(result.id).toBeDefined();

          const grouped = await useCase.getConfigRespostas();
          const allItems = Object.values(grouped).flat();
          expect(allItems.length).toBe(1);

          const saved = allItems[0];
          expect(saved.categoria).toBe(fields.categoria);
          expect(saved.valor).toBe(fields.valor);
          expect(saved.label).toBe(fields.label);
          expect(saved.cor).toBe(fields.cor);
          expect(saved.background).toBe(fields.background);
          expect(saved.id).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Validates: Requirements 12.2
 */
describe('Property 15: Config Category Fallback', () => {
  it('falls back to _default when category does not exist', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate _default entries
        fc.array(
          fc.record({
            id: fc.uuid(),
            categoria: fc.constant('_default'),
            valor: fc.stringOf(fc.char(), { minLength: 1, maxLength: 5 }),
            label: fc.stringOf(fc.char(), { minLength: 1, maxLength: 20 }),
            cor: fc.hexaString({ minLength: 6, maxLength: 6 }).map(h => `#${h}`),
            background: fc.hexaString({ minLength: 6, maxLength: 6 }).map(h => `#${h}`),
            created_at: fc.date(),
            updated_at: fc.date(),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        // Generate a non-existent category name that is NOT '_default'
        fc.stringOf(fc.char(), { minLength: 1, maxLength: 20 }).filter(s => s !== '_default'),
        async (defaultEntries, nonExistentCategory) => {
          const repo = new InMemoryConfigRespostaRepository();
          repo.seed(defaultEntries as ConfigResposta[]);
          const useCase = new ConfigRespostaCrudUseCase(repo);

          const result = await useCase.getConfigRespostas(nonExistentCategory);

          // Should fall back to _default entries
          expect(result[nonExistentCategory]).toBeDefined();
          expect(result[nonExistentCategory].length).toBe(defaultEntries.length);

          // Verify the returned entries are the _default ones
          for (const entry of result[nonExistentCategory]) {
            expect(entry.categoria).toBe('_default');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns specific category entries when category exists', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a specific category name
        fc.stringOf(fc.char(), { minLength: 1, maxLength: 15 }).filter(s => s !== '_default'),
        // Generate entries for that category
        fc.array(
          fc.record({
            valor: fc.stringOf(fc.char(), { minLength: 1, maxLength: 5 }),
            label: fc.stringOf(fc.char(), { minLength: 1, maxLength: 20 }),
            cor: fc.hexaString({ minLength: 6, maxLength: 6 }).map(h => `#${h}`),
            background: fc.hexaString({ minLength: 6, maxLength: 6 }).map(h => `#${h}`),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        // Generate _default entries
        fc.array(
          fc.record({
            valor: fc.stringOf(fc.char(), { minLength: 1, maxLength: 5 }),
            label: fc.stringOf(fc.char(), { minLength: 1, maxLength: 20 }),
            cor: fc.hexaString({ minLength: 6, maxLength: 6 }).map(h => `#${h}`),
            background: fc.hexaString({ minLength: 6, maxLength: 6 }).map(h => `#${h}`),
          }),
          { minLength: 1, maxLength: 3 }
        ),
        async (categoryName, categoryEntries, defaultEntries) => {
          const repo = new InMemoryConfigRespostaRepository();

          // Seed with both category-specific and _default entries
          const allItems: ConfigResposta[] = [
            ...categoryEntries.map((e, i) => ({
              id: uuidv4(),
              categoria: categoryName,
              valor: e.valor,
              label: e.label,
              cor: e.cor,
              background: e.background,
              created_at: new Date(),
              updated_at: new Date(),
            })),
            ...defaultEntries.map((e, i) => ({
              id: uuidv4(),
              categoria: '_default',
              valor: e.valor,
              label: e.label,
              cor: e.cor,
              background: e.background,
              created_at: new Date(),
              updated_at: new Date(),
            })),
          ];
          repo.seed(allItems);

          const useCase = new ConfigRespostaCrudUseCase(repo);
          const result = await useCase.getConfigRespostas(categoryName);

          // Should return the specific category entries, not _default
          expect(result[categoryName]).toBeDefined();
          expect(result[categoryName].length).toBe(categoryEntries.length);

          for (const entry of result[categoryName]) {
            expect(entry.categoria).toBe(categoryName);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Validates: Requirements 12.3
 */
describe('Property 16: Config Grouped by Category', () => {
  it('all records appear in exactly one category group', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate multiple categories with entries
        fc.array(
          fc.tuple(
            fc.stringOf(fc.char(), { minLength: 1, maxLength: 15 }),
            fc.integer({ min: 1, max: 4 })
          ),
          { minLength: 1, maxLength: 5 }
        ),
        async (categorySpecs) => {
          const repo = new InMemoryConfigRespostaRepository();

          // Create entries for each category
          const allItems: ConfigResposta[] = [];
          for (const [categoryName, count] of categorySpecs) {
            for (let i = 0; i < count; i++) {
              allItems.push({
                id: uuidv4(),
                categoria: categoryName,
                valor: String(i),
                label: `Label ${i}`,
                cor: '#000000',
                background: '#ffffff',
                created_at: new Date(),
                updated_at: new Date(),
              });
            }
          }
          repo.seed(allItems);

          const useCase = new ConfigRespostaCrudUseCase(repo);
          const result = await useCase.getConfigRespostas();

          // Verify total count matches
          const groupedItems = Object.values(result).flat();
          expect(groupedItems.length).toBe(allItems.length);

          // Verify every record appears in exactly one group
          const seenIds = new Set<string>();
          for (const [category, items] of Object.entries(result)) {
            for (const item of items) {
              // Each item should belong to the category it's grouped under
              expect(item.categoria).toBe(category);
              // Each item should appear only once
              expect(seenIds.has(item.id)).toBe(false);
              seenIds.add(item.id);
            }
          }

          // All original items should be accounted for
          expect(seenIds.size).toBe(allItems.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});

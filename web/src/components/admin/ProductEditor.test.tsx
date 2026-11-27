import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui';
import type { AdminProduct, ProductMedia } from '@/lib/api/types';
import { ProductEditor } from './ProductEditor';

const mocks = vi.hoisted(() => ({
  routerReplace: vi.fn(),
  createAdminProduct: vi.fn(),
  updateAdminProduct: vi.fn(),
  adminProduct: vi.fn(),
  adminCategories: vi.fn(),
  categories: vi.fn(),
  setAdminProductStatus: vi.fn(),
  updateProductMedia: vi.fn(),
  deleteProductMedia: vi.fn(),
  uploadAdminProductImage: vi.fn(),
  queryClient: {
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
  },
}));

let currentProduct: AdminProduct | null = null;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.routerReplace }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) =>
    queryKey[0] === 'admin-product'
      ? {
          data: queryKey[1] ? currentProduct : undefined,
          isPending: false,
          isError: false,
          error: null,
          refetch: vi.fn(),
        }
      : {
          data: [
            {
              _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
              name: 'General',
              slug: 'general',
              formProfile: 'general',
              isActive: true,
              children: [],
            },
          ],
          isPending: false,
          isError: false,
          error: null,
          refetch: vi.fn(),
        },
  useQueryClient: () => mocks.queryClient,
}));

vi.mock('@/components/admin', () => ({
  AdminConfirmDialog: () => null,
  AdminStatusBadge: () => null,
  PageHeader: ({ title, actions }: { title: string; actions?: ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {actions}
    </header>
  ),
}));

vi.mock('@/lib/api/client', () => ({
  api: {
    adminProduct: mocks.adminProduct,
    adminCategories: mocks.adminCategories,
    categories: mocks.categories,
    createAdminProduct: mocks.createAdminProduct,
    updateAdminProduct: mocks.updateAdminProduct,
    setAdminProductStatus: mocks.setAdminProductStatus,
    updateProductMedia: mocks.updateProductMedia,
    deleteProductMedia: mocks.deleteProductMedia,
  },
  ApiError: class ApiError extends Error {
    constructor(
      message: string,
      readonly code: string,
      readonly status: number,
    ) {
      super(message);
    }
  },
  uploadAdminProductImage: mocks.uploadAdminProductImage,
}));

vi.mock('@/components/providers/AuthProvider', () => ({
  usePermissions: () => ({ can: () => true }),
}));

vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

const CATEGORY_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const NEW_PRODUCT_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const EXISTING_PRODUCT_ID = 'cccccccccccccccccccccccc';

function makeProduct(
  id = NEW_PRODUCT_ID,
  overrides: Partial<AdminProduct> = {},
): AdminProduct {
  return {
    _id: id,
    title: 'Fixture product',
    slug: 'fixture-product',
    description: 'A complete description for this custom product.',
    category: CATEGORY_ID,
    productType: 'tshirt',
    media: [],
    lightingGalleryEnabled: false,
    sku: 'FIXTURE-001',
    basePriceMinor: 1200,
    currency: 'GBP',
    optionGroups: [],
    quantityPricing: [],
    printTechniques: [],
    specifications: [],
    artworkRequirements: {
      allowedFormats: [],
      minimumResolutionNote: '',
      notes: '',
    },
    artworkRequired: false,
    stock: {
      trackInventory: false,
      quantity: 0,
      lowStockThreshold: 0,
      allowBackorder: false,
      reserveBlanksForMadeToOrder: false,
    },
    status: 'draft',
    themes: [],
    seo: { metaTitle: '', metaDescription: '', canonicalUrl: '' },
    viewCount: 0,
    soldCount: 0,
    ratingAverage: 0,
    ratingCount: 0,
    isFeatured: false,
    minOrderQuantity: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeMedia(): ProductMedia {
  return {
    _id: 'dddddddddddddddddddddddd',
    url: 'https://cdn.example.test/product.png',
    width: 800,
    height: 800,
    alt: 'Custom product image',
    view: 'front',
    isPrimary: true,
    sortOrder: 0,
  };
}

const NativeURL = globalThis.URL;
class TestURL extends NativeURL {
  static createObjectURL(): string {
    return 'blob:product-image';
  }

  static revokeObjectURL(): void {}
}

class TestImage {
  naturalWidth = 800;
  naturalHeight = 800;
  onload: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

function renderEditor(productId?: string) {
  window.history.replaceState(
    {},
    '',
    productId ? `/admin/products/${productId}` : '/admin/products/new',
  );
  currentProduct = productId ? makeProduct(productId) : null;
  return render(
    <ToastProvider>
      <ProductEditor productId={productId} />
    </ToastProvider>,
  );
}

function changeField(
  container: HTMLElement,
  name: string,
  value: string,
): void {
  const field = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[name="${name}"]`,
  );
  if (!field) throw new Error(`Missing form field: ${name}`);
  fireEvent.change(field, { target: { value } });
}

function fillProductForm(container: HTMLElement): void {
  changeField(container, 'title', 'New custom print');
  changeField(
    container,
    'description',
    'A fully described custom printed product.',
  );
  changeField(container, 'sku', 'NEW-PRINT-001');
  const category = container.querySelector<HTMLSelectElement>(
    'select[aria-label="Category"]',
  );
  if (!category) throw new Error('Missing product category selector');
  fireEvent.change(category, { target: { value: CATEGORY_ID } });
}

function addImage(container: HTMLElement): void {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('Missing product image input');
  const file = new File(['image'], 'product.png', { type: 'image/png' });
  fireEvent.change(input, { target: { files: [file] } });
}

function submitForm(container: HTMLElement): void {
  const form = container.querySelector('form');
  if (!form) throw new Error('Missing product editor form');
  fireEvent.submit(form);
}

function openImagesSection(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Images' }));
}

async function createDraftWithTwoFailedUploads(container: HTMLElement) {
  fillProductForm(container);
  mocks.uploadAdminProductImage
    .mockRejectedValueOnce(new Error('temporary upload failure'))
    .mockRejectedValueOnce(new Error('temporary upload failure'));
  addImage(container);
  await waitFor(() =>
    expect(mocks.uploadAdminProductImage).toHaveBeenCalledTimes(1),
  );
  openImagesSection();
  await screen.findByText(/Upload failed for product\.png/);
  changeField(container, 'title', 'Edited after draft creation');
  submitForm(container);
  await waitFor(() =>
    expect(mocks.updateAdminProduct).toHaveBeenCalledTimes(1),
  );
  await waitFor(() =>
    expect(mocks.uploadAdminProductImage).toHaveBeenCalledTimes(2),
  );
  await screen.findByRole('button', { name: /Retry upload/ });
  expect(mocks.routerReplace).not.toHaveBeenCalled();
}

beforeEach(() => {
  currentProduct = null;
  mocks.routerReplace.mockReset();
  mocks.createAdminProduct.mockReset();
  mocks.updateAdminProduct.mockReset();
  mocks.adminProduct.mockReset();
  mocks.adminCategories.mockReset();
  mocks.categories.mockReset();
  mocks.setAdminProductStatus.mockReset();
  mocks.updateProductMedia.mockReset();
  mocks.deleteProductMedia.mockReset();
  mocks.uploadAdminProductImage.mockReset();
  mocks.queryClient.setQueryData.mockReset();
  mocks.queryClient.getQueryData.mockReset();
  mocks.queryClient.invalidateQueries.mockReset().mockResolvedValue(undefined);
  mocks.createAdminProduct.mockResolvedValue(makeProduct(NEW_PRODUCT_ID));
  mocks.updateAdminProduct.mockImplementation((id: string) =>
    Promise.resolve(makeProduct(id)),
  );
  mocks.adminProduct.mockImplementation(() => Promise.resolve(currentProduct));
  mocks.uploadAdminProductImage.mockResolvedValue(makeMedia());
  vi.stubGlobal('URL', TestURL);
  vi.stubGlobal('Image', TestImage);
  vi.stubGlobal('crypto', { randomUUID: () => 'test-image-key' });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ProductEditor navigation', () => {
  it('navigates after saving a new product without pending images', async () => {
    const view = renderEditor();
    fillProductForm(view.container);
    submitForm(view.container);

    await waitFor(() =>
      expect(mocks.createAdminProduct).toHaveBeenCalledTimes(1),
    );
    await waitFor(() =>
      expect(mocks.routerReplace).toHaveBeenCalledWith('/admin/products'),
    );
    expect(mocks.uploadAdminProductImage).not.toHaveBeenCalled();
  });

  it('navigates after saving a draft created during an earlier image upload', async () => {
    const view = renderEditor();
    fillProductForm(view.container);
    addImage(view.container);

    await waitFor(() =>
      expect(mocks.createAdminProduct).toHaveBeenCalledTimes(1),
    );
    await screen.findByText(/Image uploaded successfully/);
    expect(mocks.routerReplace).not.toHaveBeenCalled();

    changeField(view.container, 'title', 'Updated after draft upload');
    submitForm(view.container);

    await waitFor(() =>
      expect(mocks.updateAdminProduct).toHaveBeenCalledWith(
        NEW_PRODUCT_ID,
        expect.any(Object),
      ),
    );
    await waitFor(() => expect(mocks.routerReplace).toHaveBeenCalledTimes(1));
  });

  it('keeps the editor open after saving an existing product without images', async () => {
    const view = renderEditor(EXISTING_PRODUCT_ID);
    await screen.findByDisplayValue('Fixture product');
    changeField(view.container, 'title', 'Updated existing product');
    submitForm(view.container);

    await waitFor(() =>
      expect(mocks.updateAdminProduct).toHaveBeenCalledTimes(1),
    );
    expect(mocks.routerReplace).not.toHaveBeenCalled();
  });

  it('keeps the editor open after saving an existing product with an image', async () => {
    const view = renderEditor(EXISTING_PRODUCT_ID);
    await screen.findByDisplayValue('Fixture product');
    addImage(view.container);
    await screen.findByText(/Image uploaded successfully/);
    changeField(view.container, 'title', 'Existing product with an image');
    submitForm(view.container);

    await waitFor(() =>
      expect(mocks.updateAdminProduct).toHaveBeenCalledTimes(1),
    );
    expect(mocks.routerReplace).not.toHaveBeenCalled();
  });

  it('keeps a new product in the editor when an upload fails', async () => {
    const view = renderEditor();
    fillProductForm(view.container);
    mocks.uploadAdminProductImage.mockRejectedValueOnce(
      new Error('temporary upload failure'),
    );
    addImage(view.container);

    await waitFor(() =>
      expect(mocks.uploadAdminProductImage).toHaveBeenCalledTimes(1),
    );
    openImagesSection();
    await screen.findByText(/Upload failed for product\.png/);
    expect(mocks.routerReplace).not.toHaveBeenCalled();
    expect(
      await screen.findByRole('button', { name: /Retry upload/ }),
    ).toBeTruthy();
  });

  it('navigates after a failed new-product upload is successfully retried', async () => {
    const view = renderEditor();
    await createDraftWithTwoFailedUploads(view.container);
    mocks.uploadAdminProductImage.mockResolvedValueOnce(makeMedia());
    fireEvent.click(screen.getByRole('button', { name: /Retry upload/ }));

    await waitFor(() =>
      expect(mocks.uploadAdminProductImage).toHaveBeenCalledTimes(3),
    );
    await waitFor(() =>
      expect(mocks.routerReplace).toHaveBeenCalledWith('/admin/products'),
    );
    expect(mocks.routerReplace).toHaveBeenCalledTimes(1);
  });

  it('keeps an existing product open after a failed upload is retried', async () => {
    const view = renderEditor(EXISTING_PRODUCT_ID);
    await screen.findByDisplayValue('Fixture product');
    mocks.uploadAdminProductImage
      .mockRejectedValueOnce(new Error('temporary upload failure'))
      .mockRejectedValueOnce(new Error('temporary upload failure'));
    addImage(view.container);
    await waitFor(() =>
      expect(mocks.uploadAdminProductImage).toHaveBeenCalledTimes(1),
    );
    openImagesSection();
    await screen.findByText(/Upload failed for product\.png/);
    changeField(view.container, 'title', 'Existing product with retry');
    submitForm(view.container);
    await waitFor(() =>
      expect(mocks.updateAdminProduct).toHaveBeenCalledTimes(1),
    );
    await waitFor(() =>
      expect(mocks.uploadAdminProductImage).toHaveBeenCalledTimes(2),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: /Retry upload/ }),
    );

    await waitFor(() =>
      expect(mocks.uploadAdminProductImage).toHaveBeenCalledTimes(3),
    );
    await screen.findByText(/Image uploaded successfully/);
    expect(mocks.routerReplace).not.toHaveBeenCalled();
  });

  it('prevents duplicate new-product creation while a save is in progress', async () => {
    const view = renderEditor();
    fillProductForm(view.container);
    let resolveCreate: (product: AdminProduct) => void = () => {
      throw new Error('Create request was not started');
    };
    mocks.createAdminProduct.mockImplementation(
      () =>
        new Promise<AdminProduct>((resolve) => {
          resolveCreate = resolve;
        }),
    );

    submitForm(view.container);
    await waitFor(() =>
      expect(mocks.createAdminProduct).toHaveBeenCalledTimes(1),
    );
    submitForm(view.container);
    expect(mocks.createAdminProduct).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCreate(makeProduct(NEW_PRODUCT_ID));
    });
    await waitFor(() =>
      expect(mocks.routerReplace).toHaveBeenCalledWith('/admin/products'),
    );
  });

  it('keeps a new product editor and entered values when creation fails', async () => {
    const view = renderEditor();
    fillProductForm(view.container);
    changeField(view.container, 'title', 'New title preserved after failure');
    mocks.createAdminProduct.mockRejectedValueOnce(new Error('offline'));
    submitForm(view.container);

    const saveErrors = await screen.findAllByText(
      'Product details could not be saved. Please try again.',
    );
    expect(saveErrors.length).toBeGreaterThan(0);
    expect(
      view.container.querySelector<HTMLInputElement>('[name="title"]')?.value,
    ).toBe('New title preserved after failure');
    expect(mocks.routerReplace).not.toHaveBeenCalled();
  });
  it('keeps the editor and entered values when saving fails', async () => {
    const view = renderEditor(EXISTING_PRODUCT_ID);
    await screen.findByDisplayValue('Fixture product');
    changeField(view.container, 'title', 'Value preserved after a failure');
    mocks.updateAdminProduct.mockRejectedValueOnce(new Error('offline'));
    submitForm(view.container);

    const saveErrors = await screen.findAllByText(
      'Product details could not be saved. Please try again.',
    );
    expect(saveErrors.length).toBeGreaterThan(0);
    expect(
      view.container.querySelector<HTMLInputElement>('[name="title"]')?.value,
    ).toBe('Value preserved after a failure');
    expect(mocks.routerReplace).not.toHaveBeenCalled();
  });
});

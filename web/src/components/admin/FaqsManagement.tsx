'use client';

import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  AdminConfirmDialog,
  AdminEmptyState,
  PageHeader,
} from '@/components/admin';
import { AdminIconButton } from '@/components/admin/AdminIconButton';
import {
  Button,
  ErrorState,
  Input,
  Modal,
  Textarea,
  useToast,
} from '@/components/ui';
import { usePermissions } from '@/components/providers/AuthProvider';
import { api, ApiError } from '@/lib/api/client';
import type { AdminFaq } from '@/lib/api/types';

type FaqDraft = {
  question: string;
  answer: string;
  category: string;
  sortOrder: number;
  isPublished: boolean;
};

const EMPTY_DRAFT: FaqDraft = {
  question: '',
  answer: '',
  category: 'Orders & delivery',
  sortOrder: 0,
  isPublished: false,
};

const STARTER_FAQS: FaqDraft[] = [
  {
    category: 'Products',
    sortOrder: 0,
    isPublished: true,
    question: 'What does Dainty Bloom make?',
    answer:
      'Our main shop focuses on made-to-order 3D-printed home pieces, including décor, vases and planters, lamps, flower coasters, racks, side tables, pet bowl stands, seasonal decorations, and jewelry boxes. Browse the shop for currently available designs.',
  },
  {
    category: 'Custom requests',
    sortOrder: 0,
    isPublished: true,
    question: 'Can I request a custom design?',
    answer:
      'Yes. Send us a custom request with the item you have in mind, a description, and any useful reference images. We will review the design and let you know what is possible, along with a quote and next steps, before production begins.',
  },
  {
    category: 'Custom requests',
    sortOrder: 1,
    isPublished: true,
    question: 'Which items are available by custom request only?',
    answer:
      'Printed T-shirts, mugs, tote bags, phone cases, and canvases are handled as custom requests rather than standard shop listings. Availability depends on the design and production requirements, which we confirm with you first.',
  },
  {
    category: 'Custom requests',
    sortOrder: 2,
    isPublished: true,
    question: 'What kinds of canvas can I request?',
    answer:
      'We offer paint-it-yourself canvases with a design to colour, as well as dimensional canvas artwork built from layered filament mesh. In your request, tell us which style you mean and describe the design you would like.',
  },
  {
    category: 'Custom requests',
    sortOrder: 3,
    isPublished: true,
    question: 'Do I need finished artwork before I contact you?',
    answer:
      'No. You can upload finished artwork, share a reference image, or describe your idea in words. Tell us how you want an uploaded image used so we understand whether it is your design or inspiration.',
  },
  {
    category: 'Themes & personalisation',
    sortOrder: 0,
    isPublished: true,
    question: 'Can I request a particular theme?',
    answer:
      'Yes. Requests can be inspired by themes such as Autumn, Halloween, Christmas, or Anime, or by an idea of your own. We will review the requested design and confirm feasibility before accepting it.',
  },
  {
    category: 'Custom requests',
    sortOrder: 4,
    isPublished: true,
    question: 'What happens after I send a custom request?',
    answer:
      'Our team reviews the details and any images you provide. We then contact you with availability, a quote, and the next steps. A request is not an order until the details and price have been agreed.',
  },
  {
    category: 'Custom requests',
    sortOrder: 5,
    isPublished: true,
    question: 'Can I include size, colour, quantity, or a budget?',
    answer:
      'Yes. Add any preferences you already know in the optional fields on the request form. You can leave them blank if you are unsure; we can discuss suitable options when we review your idea.',
  },
  {
    category: 'Orders & delivery',
    sortOrder: 0,
    isPublished: true,
    question: 'How do I know the price and delivery details?',
    answer:
      'Product prices and available delivery information are shown during shopping and checkout. For a custom request, we confirm the quote and relevant next steps with you before production or payment.',
  },
  {
    category: 'Orders & delivery',
    sortOrder: 1,
    isPublished: true,
    question: 'How can I ask a question about an existing order?',
    answer:
      'Use the Contact Us page and include your order number and the email address used at checkout. Please do not send payment card details or passwords.',
  },
];

export function FaqsManagement() {
  const { can } = usePermissions();
  const canWrite = can('settings:write');
  const queryClient = useQueryClient();
  const toast = useToast();
  const faqs = useQuery({
    queryKey: ['admin-faqs'],
    queryFn: api.adminFaqs,
    enabled: canWrite,
    retry: false,
  });
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AdminFaq | null>(null);
  const [deleting, setDeleting] = useState<AdminFaq | null>(null);
  const [draft, setDraft] = useState<FaqDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState('');

  if (!canWrite)
    return (
      <main className="admin-access-denied">
        <h1>You do not have permission to manage FAQs.</h1>
      </main>
    );

  function startEditor(faq?: AdminFaq) {
    setEditing(faq ?? null);
    setError('');
    setDraft(
      faq
        ? {
            question: faq.question,
            answer: faq.answer,
            category: faq.category,
            sortOrder: faq.sortOrder,
            isPublished: faq.isPublished,
          }
        : { ...EMPTY_DRAFT, sortOrder: faqs.data?.items.length ?? 0 },
    );
    setEditorOpen(true);
  }

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['admin-faqs'] });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (editing) await api.updateAdminFaq(editing._id, draft);
      else await api.createAdminFaq(draft);
      await refresh();
      toast(editing ? 'FAQ updated.' : 'FAQ added.', 'success');
      setEditorOpen(false);
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'The FAQ could not be saved.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function togglePublished(faq: AdminFaq) {
    try {
      await api.updateAdminFaq(faq._id, { isPublished: !faq.isPublished });
      await refresh();
      toast(faq.isPublished ? 'FAQ unpublished.' : 'FAQ published.', 'success');
    } catch (cause) {
      toast(
        cause instanceof ApiError
          ? cause.message
          : 'FAQ status could not be changed.',
        'error',
      );
    }
  }

  async function removeFaq() {
    if (!deleting) return;
    try {
      await api.deleteAdminFaq(deleting._id);
      await refresh();
      toast('FAQ deleted.', 'success');
    } catch (cause) {
      toast(
        cause instanceof ApiError ? cause.message : 'FAQ could not be deleted.',
        'error',
      );
    } finally {
      setDeleting(null);
    }
  }

  async function addStarterSet() {
    if (faqs.isPending || faqs.isFetching || faqs.data?.items.length) return;
    setSeeding(true);
    let added = 0;
    try {
      for (const starter of STARTER_FAQS) {
        await api.createAdminFaq(starter);
        added += 1;
      }
      toast(
        '10 starter FAQs added and published. You can edit them any time.',
        'success',
      );
    } catch (cause) {
      toast(
        `${added} FAQs were added before an error. Refresh the list and continue from there. ${cause instanceof ApiError ? cause.message : ''}`,
        'error',
      );
    } finally {
      await refresh();
      setSeeding(false);
    }
  }

  const items = faqs.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Frequently asked questions"
        description="Write clear answers for customers. Publish only the answers you are ready to share."
        actions={
          <>
            {faqs.isSuccess && !items.length ? (
              <Button
                variant="secondary"
                onClick={() => void addStarterSet()}
                loading={seeding}
                disabled={faqs.isPending || faqs.isFetching}
              >
                Add 10 starter FAQs
              </Button>
            ) : null}
            <Button onClick={() => startEditor()}>
              <Plus size={17} aria-hidden="true" /> Add FAQ
            </Button>
          </>
        }
      />
      {faqs.isPending ? (
        <section className="admin-panel admin-loading-block" role="status">
          <span className="loading-skeleton" />
          <span className="loading-skeleton" />
          <span className="loading-skeleton" />
        </section>
      ) : faqs.isError ? (
        <section className="admin-panel">
          <ErrorState title="FAQs could not be loaded">
            The FAQ list is unavailable.
          </ErrorState>
          <Button variant="secondary" onClick={() => void faqs.refetch()}>
            Try again
          </Button>
        </section>
      ) : items.length ? (
        <div className="admin-faq-list">
          {items.map((faq) => (
            <article className="admin-panel admin-faq-card" key={faq._id}>
              <div className="admin-faq-card__top">
                <span>{faq.category}</span>
                <span
                  className={`admin-faq-status${faq.isPublished ? ' is-published' : ''}`}
                >
                  {faq.isPublished ? 'Published' : 'Draft'}
                </span>
              </div>
              <h3>{faq.question}</h3>
              <p>{faq.answer}</p>
              <footer>
                <span>Display order {faq.sortOrder + 1}</span>
                <div
                  className="admin-icon-actions"
                  role="group"
                  aria-label={`Actions for ${faq.question}`}
                >
                  <AdminIconButton
                    label={faq.isPublished ? 'Unpublish FAQ' : 'Publish FAQ'}
                    onClick={() => void togglePublished(faq)}
                  >
                    {faq.isPublished ? <EyeOff size={17} /> : <Eye size={17} />}
                  </AdminIconButton>
                  <AdminIconButton
                    label="Edit FAQ"
                    onClick={() => startEditor(faq)}
                  >
                    <Pencil size={17} />
                  </AdminIconButton>
                  <AdminIconButton
                    label="Delete FAQ"
                    danger
                    onClick={() => setDeleting(faq)}
                  >
                    <Trash2 size={17} />
                  </AdminIconButton>
                </div>
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <section className="admin-panel">
          <AdminEmptyState title="No FAQs yet">
            Add questions and answers individually, or start with ten common
            questions about products, custom requests, themes, and delivery.
          </AdminEmptyState>
          <div className="admin-faq-empty-actions">
            <Button onClick={() => void addStarterSet()} loading={seeding}>
              Add and publish 10 starter FAQs
            </Button>
            <Button variant="secondary" onClick={() => startEditor()}>
              <Plus size={17} aria-hidden="true" /> Write an FAQ
            </Button>
          </div>
        </section>
      )}
      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editing ? 'Edit FAQ' : 'Add FAQ'}
      >
        <form className="admin-form" onSubmit={(event) => void save(event)}>
          {error ? (
            <div className="auth-alert" role="alert">
              {error}
            </div>
          ) : null}
          <Input
            label="Question"
            value={draft.question}
            maxLength={300}
            required
            onChange={(event) =>
              setDraft({ ...draft, question: event.target.value })
            }
          />
          <Textarea
            label="Answer"
            value={draft.answer}
            maxLength={10000}
            rows={6}
            required
            onChange={(event) =>
              setDraft({ ...draft, answer: event.target.value })
            }
          />
          <Input
            label="Section"
            hint="For example: Products, Custom requests, Orders & delivery."
            value={draft.category}
            maxLength={100}
            required
            onChange={(event) =>
              setDraft({ ...draft, category: event.target.value })
            }
          />
          <Input
            label="Display order"
            type="number"
            min={0}
            step={1}
            value={draft.sortOrder}
            required
            onChange={(event) =>
              setDraft({ ...draft, sortOrder: Number(event.target.value) })
            }
          />
          <label className="admin-switch">
            <input
              type="checkbox"
              role="switch"
              checked={draft.isPublished}
              onChange={(event) =>
                setDraft({ ...draft, isPublished: event.target.checked })
              }
            />
            <span>
              <strong>Published</strong>
              <small>Published FAQs appear on the public FAQ page.</small>
            </span>
          </label>
          <div className="button-row">
            <Button variant="secondary" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? 'Save changes' : 'Add FAQ'}
            </Button>
          </div>
        </form>
      </Modal>
      <AdminConfirmDialog
        open={Boolean(deleting)}
        title="Delete FAQ?"
        onClose={() => setDeleting(null)}
        onConfirm={() => void removeFaq()}
      >{`Delete “${deleting?.question ?? 'this FAQ'}”? This removes it from the public page and admin list.`}</AdminConfirmDialog>
    </>
  );
}

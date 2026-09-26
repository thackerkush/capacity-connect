'use client';

import React, { useState } from 'react';
import { Modal } from './Modal';
import { api } from '@/lib/api-client';
import { toast } from 'sonner';
import { PlusCircle, Layers } from 'lucide-react';

interface AddModuleModalProps {
  courseId: string;
  courseTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddModuleModal({
  courseId,
  courseTitle,
  isOpen,
  onClose,
  onSuccess,
}: AddModuleModalProps) {
  const [title, setTitle] = useState('');
  const [sequenceOrder, setSequenceOrder] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Module title is required');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post(`/courses/${courseId}/modules`, {
        title: title.trim(),
        sequenceOrder: Number(sequenceOrder),
      });
      toast.success(`Module "${title}" added successfully!`);
      setTitle('');
      setSequenceOrder(1);
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to add module');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Syllabus Module">
      <div className="mb-4">
        <p className="text-xs text-slate-400">
          Adding module to:{' '}
          <span className="text-blue-400 font-semibold">{courseTitle}</span>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Module Title */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wide mb-1.5">
            Module Title
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Module 1: Introduction to Microservices"
            className="w-full px-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
          />
        </div>

        {/* Sequence Order */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wide mb-1.5">
            Sequence Order
          </label>
          <input
            type="number"
            required
            min={1}
            value={sequenceOrder}
            onChange={(e) => setSequenceOrder(Number(e.target.value))}
            className="w-full px-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Determines the order this module appears in the course syllabus.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-400 border border-slate-700 hover:bg-slate-800 hover:text-white transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white transition flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <PlusCircle className="w-4 h-4" />
            {isSubmitting ? 'Adding...' : 'Add Module'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

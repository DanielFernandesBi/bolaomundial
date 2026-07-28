'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Cropper from 'react-easy-crop';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getCroppedImg, blobToFile } from '@/lib/canvasUtils';
import { createBrowserClient } from '@/lib/supabase';
import { updateProfileAvatar } from '@/app/actions/profile';
import type { Area, Point } from 'react-easy-crop';

interface AvatarUploadDialogProps {
  currentAvatarUrl?: string | null;
  userId: string;
  userInitials: string;
}

export function AvatarUploadDialog({
  currentAvatarUrl,
  userId,
  userInitials,
}: AvatarUploadDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onCropComplete = useCallback(
    (croppedArea: Area, croppedAreaPixels: Area) => {
      setCroppedAreaPixels(croppedAreaPixels);
    },
    []
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Por favor, selecione um arquivo de imagem');
      return;
    }

    const reader = new FileReader();
    reader.addEventListener('load', () => {
      setImageSrc(reader.result as string);
      setError(null);
    });
    reader.readAsDataURL(file);
  };

  const handleCancel = () => {
    setImageSrc(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!imageSrc || !croppedAreaPixels) {
      setError('Por favor, selecione e ajuste a imagem');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      // Gerar o blob da imagem recortada
      const croppedBlob = await getCroppedImg(
        imageSrc,
        croppedAreaPixels,
        0
      );

      // Gerar nome de arquivo único
      const filename = `${userId}-${Date.now()}.jpg`;
      const file = blobToFile(croppedBlob, filename);

      // Fazer upload para o Supabase Storage
      const supabase = createBrowserClient();
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filename, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Obter URL pública
      const {
        data: { publicUrl },
      } = supabase.storage.from('avatars').getPublicUrl(filename);

      // Atualizar perfil
      const result = await updateProfileAvatar(publicUrl);

      if (result.error) {
        throw new Error(result.error);
      }

      setSuccess(true);
      setTimeout(() => {
        setOpen(false);
        handleCancel();
        setSuccess(false);
        router.refresh();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Erro ao fazer upload da imagem');
    } finally {
      setIsUploading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      handleCancel();
      setSuccess(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="cursor-pointer hover:opacity-80 transition-opacity w-full h-full"
        >
          <Avatar className="w-full h-full">
            <AvatarImage src={currentAvatarUrl || undefined} className="object-cover" />
            <AvatarFallback className="text-black text-3xl font-bold bg-amber-500">
              {userInitials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DialogTrigger>
      <DialogContent className="bg-slate-900 border-slate-800 max-w-2xl">
        <DialogHeader>
          <DialogTitle>Alterar Foto de Perfil</DialogTitle>
          <DialogDescription>
            Selecione uma imagem e ajuste o recorte para sua foto de perfil.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!imageSrc ? (
            <div className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-slate-700 rounded-lg">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
                id="avatar-upload"
              />
              <label
                htmlFor="avatar-upload"
                className="cursor-pointer bg-amber-500 text-black px-6 py-3 rounded-md font-medium hover:bg-amber-400 transition-colors"
              >
                Selecionar Imagem
              </label>
              <p className="text-slate-400 text-sm mt-4">
                Formatos aceitos: JPG, PNG, GIF
              </p>
            </div>
          ) : (
            <>
              <div className="relative w-full h-[400px] bg-slate-950 rounded-lg overflow-hidden">
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                  cropShape="round"
                  showGrid={false}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-slate-300">Zoom</label>
                <Slider
                  value={[zoom]}
                  min={1}
                  max={3}
                  step={0.1}
                  onValueChange={(value) => setZoom(value[0])}
                  className="w-full"
                />
              </div>
            </>
          )}

          {error && (
            <div className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-md p-3">
              {error}
            </div>
          )}

          {success && (
            <div className="text-sm text-green-500 bg-green-500/10 border border-green-500/20 rounded-md p-3">
              Foto atualizada com sucesso!
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={handleCancel}
            disabled={isUploading}
            className="text-slate-300 hover:text-white"
          >
            {imageSrc ? 'Cancelar' : 'Fechar'}
          </Button>
          {imageSrc && (
            <Button
              type="button"
              onClick={handleSave}
              disabled={isUploading || !croppedAreaPixels}
              className="bg-amber-500 text-black hover:bg-amber-400"
            >
              {isUploading ? 'Salvando...' : 'Salvar Foto'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


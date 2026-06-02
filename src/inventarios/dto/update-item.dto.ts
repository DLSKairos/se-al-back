import { CreateAccesorioDto } from './create-accesorio.dto';

export class UpdateItemDto {
  numero?: number;
  parte_no?: string;
  pais?: string;
  descripcion?: string;
  marca?: string;
  modelo?: string;
  serial?: string;
  cantidad?: number;
  extraido_por_ia?: boolean;
  tipo_novedad?: string;
  accesorios?: CreateAccesorioDto[];
}

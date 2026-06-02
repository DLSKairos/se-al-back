-- CreateTable
CREATE TABLE "inventario_sessions" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "tipo_formulario" TEXT NOT NULL DEFAULT 'acta_inspeccion_previa',
    "estado" TEXT NOT NULL DEFAULT 'borrador',
    "agencia_aduanas" TEXT,
    "codigo_agencia" TEXT,
    "representante_legal" TEXT,
    "mandato" TEXT,
    "deposito" TEXT,
    "direccion_deposito" TEXT,
    "documento_transporte" TEXT,
    "manifiesto" TEXT,
    "fecha_manifiesto" TIMESTAMP(3),
    "transportadora" TEXT,
    "consignatario" TEXT,
    "no_bultos" INTEGER,
    "peso" DOUBLE PRECISION,
    "precintos_retira" TEXT,
    "precintos_coloca" TEXT,
    "observaciones" TEXT,
    "firmado_deposito_nombre" TEXT,
    "firmado_agencia_nombre" TEXT,
    "firmado_deposito_url" TEXT,
    "firmado_agencia_url" TEXT,
    "firmado_deposito_at" TIMESTAMP(3),
    "firmado_agencia_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventario_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventario_items" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "parte_no" TEXT,
    "pais" TEXT,
    "descripcion" TEXT,
    "marca" TEXT,
    "modelo" TEXT,
    "serial" TEXT,
    "cantidad" INTEGER,
    "extraido_por_ia" BOOLEAN NOT NULL DEFAULT false,
    "tipo_novedad" TEXT,

    CONSTRAINT "inventario_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventario_accesorios" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "parte_no" TEXT,
    "pais" TEXT,
    "descripcion" TEXT,
    "marca" TEXT,
    "modelo" TEXT,

    CONSTRAINT "inventario_accesorios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventario_fotos" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "item_id" TEXT,
    "tipo" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventario_fotos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventario_sessions_org_id_estado_idx" ON "inventario_sessions"("org_id", "estado");

-- CreateIndex
CREATE INDEX "inventario_sessions_org_id_created_at_idx" ON "inventario_sessions"("org_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "inventario_items_session_id_idx" ON "inventario_items"("session_id");

-- CreateIndex
CREATE INDEX "inventario_accesorios_item_id_idx" ON "inventario_accesorios"("item_id");

-- CreateIndex
CREATE INDEX "inventario_fotos_session_id_tipo_idx" ON "inventario_fotos"("session_id", "tipo");

-- AddForeignKey
ALTER TABLE "inventario_sessions" ADD CONSTRAINT "inventario_sessions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_items" ADD CONSTRAINT "inventario_items_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "inventario_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_accesorios" ADD CONSTRAINT "inventario_accesorios_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventario_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_fotos" ADD CONSTRAINT "inventario_fotos_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "inventario_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_fotos" ADD CONSTRAINT "inventario_fotos_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventario_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

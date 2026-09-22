import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildPaginationParams } from '../common/pagination/paginate';
import { onlyDigits } from '../common/validators/is-cnpj.validator';
import { CnpjLookupService } from './cnpj/cnpj-lookup.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SupplierQueryDto } from './dto/supplier-query.dto';

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cnpjLookupService: CnpjLookupService,
  ) {}

  async create(dto: CreateSupplierDto) {
    const enrichment = await this.cnpjLookupService.lookup(dto.document);
    const legalName = dto.legalName ?? enrichment?.legalName;

    if (!legalName) {
      throw new BadRequestException(
        'Não foi possível validar o CNPJ (serviço indisponível ou CNPJ inexistente). Informe "legalName" manualmente para prosseguir.',
      );
    }

    return this.prisma.supplier.create({
      data: {
        document: onlyDigits(dto.document),
        legalName,
        tradeName: dto.tradeName ?? enrichment?.tradeName ?? null,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        zipCode: dto.zipCode ?? enrichment?.zipCode ?? null,
        street: dto.street ?? enrichment?.street ?? null,
        city: dto.city ?? enrichment?.city ?? null,
        state: dto.state ?? enrichment?.state ?? null,
        federalRegistrationStatus:
          enrichment?.federalRegistrationStatus ?? null,
      },
    });
  }

  async findAll(query: SupplierQueryDto) {
    const { skip, take, orderBy } = buildPaginationParams(
      query,
      ['createdAt', 'legalName'],
      'createdAt',
    );
    const where =
      query.isActive !== undefined ? { isActive: query.isActive } : {};

    const [data, total] = await Promise.all([
      this.prisma.supplier.findMany({ skip, take, orderBy, where }),
      this.prisma.supplier.count({ where }),
    ]);

    return { data, total, page: query.page ?? 1, pageSize: take };
  }

  async findOne(id: number) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) {
      throw new NotFoundException('Fornecedor não encontrado.');
    }
    return supplier;
  }

  async update(id: number, dto: UpdateSupplierDto) {
    await this.findOne(id);

    const enrichment = dto.document
      ? await this.cnpjLookupService.lookup(dto.document)
      : null;

    return this.prisma.supplier.update({
      where: { id },
      data: {
        document: dto.document ? onlyDigits(dto.document) : undefined,
        legalName: dto.legalName ?? enrichment?.legalName ?? undefined,
        tradeName: dto.tradeName ?? enrichment?.tradeName ?? undefined,
        email: dto.email,
        phone: dto.phone,
        zipCode: dto.zipCode ?? enrichment?.zipCode ?? undefined,
        street: dto.street ?? enrichment?.street ?? undefined,
        city: dto.city ?? enrichment?.city ?? undefined,
        state: dto.state ?? enrichment?.state ?? undefined,
        federalRegistrationStatus:
          enrichment?.federalRegistrationStatus ?? undefined,
        isActive: dto.isActive,
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    // P2003 (supplier still referenced by a Quote) is mapped to 409 by the
    // global PrismaExceptionFilter — no per-service special-casing needed.
    await this.prisma.supplier.delete({ where: { id } });
    return { message: 'Fornecedor removido com sucesso.' };
  }
}

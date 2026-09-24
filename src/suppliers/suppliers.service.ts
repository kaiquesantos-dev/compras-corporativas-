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

// CRUD de fornecedores, com um diferencial: ao cadastrar/atualizar, os
// dados de razão social e endereço são preenchidos automaticamente
// consultando o CNPJ na BrasilAPI (via CnpjLookupService) — o comprador só
// precisa digitar o CNPJ.
@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cnpjLookupService: CnpjLookupService,
  ) {}

  async create(dto: CreateSupplierDto) {
    const enrichment = await this.cnpjLookupService.lookup(dto.document);
    // Regra de prioridade: se o cliente digitou o campo manualmente, esse
    // valor manda. Só usamos o dado vindo da consulta de CNPJ para
    // preencher o que ficou em branco.
    const legalName = dto.legalName ?? enrichment?.legalName;

    // Só falha se NÃO tivermos razão social de nenhuma das duas formas —
    // ou seja, a consulta de CNPJ falhou E o cliente também não informou
    // manualmente. Assim a funcionalidade continua funcionando mesmo se a
    // BrasilAPI estiver fora do ar, desde que os dados venham no body.
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

    // Só refaz a consulta de CNPJ se o documento estiver sendo alterado —
    // não faz sentido re-consultar toda vez que só o telefone muda, por
    // exemplo.
    const enrichment = dto.document
      ? await this.cnpjLookupService.lookup(dto.document)
      : null;

    // Mesma regra do create(): se o documento está mudando e nem o body nem
    // a consulta de CNPJ trazem uma razão social, não dá pra seguir. Sem
    // esta checagem, "legalName: dto.legalName ?? enrichment?.legalName ??
    // undefined" virava undefined e o Prisma simplesmente NÃO tocava o
    // campo — o registro ficava com o CNPJ novo e o nome da empresa antiga,
    // silenciosamente incoerentes.
    if (dto.document && !dto.legalName && !enrichment?.legalName) {
      throw new BadRequestException(
        'Não foi possível validar o novo CNPJ (serviço indisponível ou CNPJ inexistente). Informe "legalName" manualmente para prosseguir.',
      );
    }

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
    // Se este fornecedor ainda tiver cotações vinculadas, o Prisma recusa a
    // exclusão (erro P2003) e o PrismaExceptionFilter global já transforma
    // isso em 409 automaticamente — não precisamos checar isso na mão aqui.
    await this.prisma.supplier.delete({ where: { id } });
    return { message: 'Fornecedor removido com sucesso.' };
  }
}

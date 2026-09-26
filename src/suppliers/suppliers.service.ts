import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
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

  // O CNPJ (document) NÃO está em UpdateSupplierDto de propósito — é a
  // identidade legal do fornecedor e trava depois do cadastro (ver o
  // comentário no próprio DTO). Por isso este update() nunca mais precisa
  // reconsultar a BrasilAPI: sem CNPJ mudando, não há nada novo pra
  // enriquecer automaticamente, então o método fica bem mais simples que o
  // create() — só aplica os campos que vieram no body.
  async update(id: number, dto: UpdateSupplierDto) {
    await this.findOne(id);

    return this.prisma.supplier.update({
      where: { id },
      data: {
        legalName: dto.legalName,
        tradeName: dto.tradeName,
        email: dto.email,
        phone: dto.phone,
        zipCode: dto.zipCode,
        street: dto.street,
        city: dto.city,
        state: dto.state,
        isActive: dto.isActive,
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    try {
      await this.prisma.supplier.delete({ where: { id } });
    } catch (err) {
      // P2003: este fornecedor ainda tem cotações vinculadas. Sugerimos
      // desativar (isActive: false) em vez de excluir — a exclusão de um
      // registro com histórico de cotações apagaria dados de compras já
      // realizadas, então normalmente nem deveria ser a ação desejada.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2003'
      ) {
        throw new ConflictException(
          'Não é possível excluir este fornecedor: ele possui cotações vinculadas a solicitações de compra. Marque-o como inativo em vez de excluir, para preservar o histórico.',
        );
      }
      throw err;
    }
    return { message: 'Fornecedor removido com sucesso.' };
  }
}

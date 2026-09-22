import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { buildPaginationParams } from '../common/pagination/paginate';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

// CRUD simples de Departamento. É o cadastro mais básico do sistema —
// serve principalmente para agrupar usuários e solicitações de compra por
// setor da empresa (ex: "Tecnologia", "Financeiro").
@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateDepartmentDto) {
    return this.prisma.department.create({ data: dto });
  }

  async findAll(query: PaginationQueryDto) {
    const { skip, take, orderBy } = buildPaginationParams(
      query,
      ['createdAt', 'name'],
      'name',
    );
    const [data, total] = await Promise.all([
      this.prisma.department.findMany({ skip, take, orderBy }),
      this.prisma.department.count(),
    ]);
    return { data, total, page: query.page ?? 1, pageSize: take };
  }

  // Busca por id e já lança 404 se não existir — assim, quem chamar este
  // método (update, remove, ou outro módulo) não precisa repetir essa
  // checagem, só tratar o caso de sucesso.
  async findOne(id: number) {
    const department = await this.prisma.department.findUnique({
      where: { id },
    });
    if (!department) {
      throw new NotFoundException('Departamento não encontrado.');
    }
    return department;
  }

  async update(id: number, dto: UpdateDepartmentDto) {
    await this.findOne(id);
    return this.prisma.department.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    await this.findOne(id);
    // Não checamos aqui manualmente se existem usuários/solicitações
    // vinculados ao departamento de propósito: se houver um vínculo que
    // impede a exclusão, o Prisma lança o erro P2003 (chave estrangeira) e
    // o PrismaExceptionFilter global já converte isso em 409 sozinho.
    await this.prisma.department.delete({ where: { id } });
    return { message: 'Departamento removido com sucesso.' };
  }
}

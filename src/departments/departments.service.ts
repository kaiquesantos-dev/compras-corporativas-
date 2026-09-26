import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
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
    // User.departmentId é opcional (ON DELETE SET NULL), então o banco NÃO
    // barraria a exclusão por causa dos usuários — eles só perderiam o
    // departamento em silêncio, e um REQUESTER sem departamento não consegue
    // mais criar solicitações. Por isso a checagem é explícita aqui.
    const linkedUsers = await this.prisma.user.count({
      where: { departmentId: id },
    });
    if (linkedUsers > 0) {
      throw new ConflictException(
        `Não é possível excluir este departamento: ${linkedUsers} usuário(s) ainda estão vinculados a ele. Transfira esses usuários para outro departamento antes de excluir.`,
      );
    }
    try {
      await this.prisma.department.delete({ where: { id } });
    } catch (err) {
      // P2003 = violação de chave estrangeira: ainda existem solicitações de
      // compra apontando para este departamento (histórico que não pode
      // perder a referência). Sem este catch, o PrismaExceptionFilter global
      // também devolveria 409, mas com uma mensagem genérica.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2003'
      ) {
        throw new ConflictException(
          'Não é possível excluir este departamento: existem solicitações de compra registradas nele, que precisam manter esse histórico.',
        );
      }
      throw err;
    }
    return { message: 'Departamento removido com sucesso.' };
  }
}

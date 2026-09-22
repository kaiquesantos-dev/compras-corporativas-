import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { buildPaginationParams } from '../common/pagination/paginate';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

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
    // No pre-check for linked users/purchase requests here on purpose: the
    // global PrismaExceptionFilter already maps the resulting P2003 to 409.
    await this.prisma.department.delete({ where: { id } });
    return { message: 'Departamento removido com sucesso.' };
  }
}

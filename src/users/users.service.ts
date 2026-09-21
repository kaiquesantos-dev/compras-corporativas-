import { Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { buildPaginationParams } from '../common/pagination/paginate';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

export const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  departmentId: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertDepartmentExists(departmentId?: number) {
    if (!departmentId) return;
    const department = await this.prisma.department.findUnique({ where: { id: departmentId } });
    if (!department) {
      throw new NotFoundException('Departamento informado não existe.');
    }
  }

  async create(dto: CreateUserDto) {
    await this.assertDepartmentExists(dto.departmentId);
    const password = await bcrypt.hash(dto.password, 10);

    return this.prisma.user.create({
      data: { ...dto, password },
      select: USER_SELECT,
    });
  }

  async findAll(query: PaginationQueryDto) {
    const { skip, take, orderBy } = buildPaginationParams(
      query,
      ['createdAt', 'name', 'email'],
      'createdAt',
    );

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({ skip, take, orderBy, select: USER_SELECT }),
      this.prisma.user.count(),
    ]);

    return { data, total, page: query.page ?? 1, pageSize: take };
  }

  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }
    return user;
  }

  async update(id: number, dto: UpdateUserDto) {
    await this.findOne(id);
    await this.assertDepartmentExists(dto.departmentId);

    const data: Record<string, unknown> = { ...dto };
    if (dto.password) {
      data.password = await bcrypt.hash(dto.password, 10);
    }

    return this.prisma.user.update({ where: { id }, data, select: USER_SELECT });
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.user.delete({ where: { id } });
    return { message: 'Usuário removido com sucesso.' };
  }
}

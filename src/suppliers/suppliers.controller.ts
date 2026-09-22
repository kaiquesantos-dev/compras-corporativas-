import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SupplierQueryDto } from './dto/supplier-query.dto';
import { SuppliersService } from './suppliers.service';

// Consulta (GET) é liberada pra qualquer usuário autenticado; cadastrar e
// editar exige BUYER ou ADMIN; remover exige ADMIN.
@ApiTags('Fornecedores')
@ApiBearerAuth()
@ApiSecurity('x-api-key')
@UseGuards(JwtAuthGuard)
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('BUYER', 'ADMIN')
  @ApiOperation({
    summary: 'Cadastrar fornecedor',
    description:
      '**Papéis permitidos:** BUYER, ADMIN\n\nCadastra um fornecedor a partir do CNPJ. Razão social e endereço são preenchidos automaticamente via consulta à Receita Federal (BrasilAPI) quando não informados manualmente; campos enviados manualmente sempre têm prioridade sobre a consulta.',
  })
  @ApiResponse({ status: 201, description: 'Fornecedor cadastrado.' })
  @ApiResponse({
    status: 400,
    description:
      'CNPJ em formato inválido, ou CNPJ não encontrado/serviço indisponível sem dados manuais de fallback.',
  })
  @ApiResponse({
    status: 403,
    description: 'Papel sem permissão para cadastrar fornecedores.',
  })
  @ApiResponse({
    status: 409,
    description: 'Já existe um fornecedor com esse CNPJ.',
  })
  create(@Body() dto: CreateSupplierDto) {
    return this.suppliersService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar fornecedores',
    description: '**Papéis permitidos:** REQUESTER, BUYER, APPROVER, ADMIN',
  })
  findAll(@Query() query: SupplierQueryDto) {
    return this.suppliersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Buscar fornecedor por ID',
    description: '**Papéis permitidos:** REQUESTER, BUYER, APPROVER, ADMIN',
  })
  @ApiResponse({ status: 404, description: 'Fornecedor não encontrado.' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.suppliersService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('BUYER', 'ADMIN')
  @ApiOperation({
    summary: 'Atualizar fornecedor',
    description: '**Papéis permitidos:** BUYER, ADMIN',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.suppliersService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Remover fornecedor',
    description: '**Papéis permitidos:** ADMIN',
  })
  @ApiResponse({
    status: 409,
    description: 'Fornecedor possui cotações vinculadas.',
  })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.suppliersService.remove(id);
  }
}

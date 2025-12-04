
import { Component, inject, signal, effect, computed, ChangeDetectionStrategy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { DashboardStats } from '../../models/app.types';

declare var d3: any; // D3 Loaded from CDN

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardComponent implements AfterViewInit {
  private api = inject(ApiService);

  // Filters
  startDate = new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0];
  endDate = new Date().toISOString().split('T')[0];
  
  // State
  isLoading = signal(false);
  stats = signal<DashboardStats | null>(null);

  // D3 Containers
  @ViewChild('trendChart', { static: false }) trendChartRef!: ElementRef;
  @ViewChild('donutChart', { static: false }) donutChartRef!: ElementRef;

  constructor() {
    effect(() => {
      // Reload when context changes (Dealer or Mock Mode)
      const dealer = this.api.selectedDealerCode();
      const mock = this.api.useMockData(); // dependency
      if (dealer) this.loadData();
    });
  }

  ngAfterViewInit() {
    // Initial load handled by effect or manual trigger
  }

  loadData() {
    this.isLoading.set(true);
    const dealer = this.api.selectedDealerCode();
    
    this.api.getDashboardStats(this.startDate, this.endDate, dealer).subscribe({
      next: (data) => {
        this.stats.set(data);
        this.isLoading.set(false);
        // Defer rendering to ensure DOM is updated
        setTimeout(() => this.renderCharts(), 50);
      },
      error: () => {
        this.isLoading.set(false);
      }
    });
  }

  private renderCharts() {
    if (!this.stats() || typeof d3 === 'undefined') return;
    
    this.renderTrendChart();
    this.renderDonutChart();
  }

  private renderTrendChart() {
    const el = this.trendChartRef.nativeElement;
    d3.select(el).selectAll('*').remove(); // Clean

    const data = this.stats()!.trendSeries;
    if (!data.length) return;

    const margin = { top: 20, right: 30, bottom: 30, left: 40 };
    const width = el.clientWidth - margin.left - margin.right;
    const height = 320 - margin.top - margin.bottom;

    const svg = d3.select(el)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // --- DEFS (GRADIENTS) ---
    const defs = svg.append("defs");

    // Green Gradient (Success)
    const gradientSuccess = defs.append("linearGradient")
      .attr("id", "gradientSuccess")
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "0%")
      .attr("y2", "100%");
    gradientSuccess.append("stop").attr("offset", "0%").attr("stop-color", "#10B981").attr("stop-opacity", 0.3);
    gradientSuccess.append("stop").attr("offset", "100%").attr("stop-color", "#10B981").attr("stop-opacity", 0);

    // Red Gradient (Error)
    const gradientError = defs.append("linearGradient")
      .attr("id", "gradientError")
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "0%")
      .attr("y2", "100%");
    gradientError.append("stop").attr("offset", "0%").attr("stop-color", "#EF4444").attr("stop-opacity", 0.3);
    gradientError.append("stop").attr("offset", "100%").attr("stop-color", "#EF4444").attr("stop-opacity", 0);

    // --- SCALES ---
    const x = d3.scaleTime()
      .domain(d3.extent(data, (d: any) => new Date(d.date)))
      .range([0, width]);

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, (d: any) => Math.max(d.success, d.error)) * 1.1 || 10]) // Add 10% padding
      .range([height, 0]);

    // --- GRID LINES ---
    const makeYGridlines = () => d3.axisLeft(y).ticks(5);
    
    svg.append("g")
      .attr("class", "grid")
      .attr("opacity", 0.1)
      .call(makeYGridlines()
          .tickSize(-width)
          .tickFormat("")
      )
      .style("stroke-dasharray", "3,3");

    // --- AXIS ---
    // Custom X Axis
    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d3.timeFormat("%d %b")))
      .select(".domain").remove(); // Remove axis line
    
    svg.selectAll(".tick text")
      .attr("fill", "#9CA3AF")
      .style("font-size", "10px");

    // Custom Y Axis
    svg.append('g')
      .call(d3.axisLeft(y).ticks(5))
      .select(".domain").remove();

    // --- GENERATORS ---
    const curveType = d3.curveCatmullRom; // Smoother curves

    const areaSuccess = d3.area()
      .x((d: any) => x(new Date(d.date)))
      .y0(height)
      .y1((d: any) => y(d.success))
      .curve(curveType);

    const lineSuccess = d3.line()
      .x((d: any) => x(new Date(d.date)))
      .y((d: any) => y(d.success))
      .curve(curveType);

    const areaError = d3.area()
      .x((d: any) => x(new Date(d.date)))
      .y0(height)
      .y1((d: any) => y(d.error))
      .curve(curveType);

    const lineError = d3.line()
      .x((d: any) => x(new Date(d.date)))
      .y((d: any) => y(d.error))
      .curve(curveType);

    // --- DRAWING ---
    
    // Success Layer
    svg.append("path")
      .datum(data)
      .attr("fill", "url(#gradientSuccess)")
      .attr("d", areaSuccess);
    
    svg.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#10B981")
      .attr("stroke-width", 3)
      .attr("d", lineSuccess);

    // Error Layer
    svg.append("path")
      .datum(data)
      .attr("fill", "url(#gradientError)")
      .attr("d", areaError);

    svg.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#EF4444")
      .attr("stroke-width", 3)
      .attr("d", lineError)
      .style("stroke-dasharray", "4,4"); // Dashed line for errors

    // --- INTERACTIVE TOOLTIP ---
    
    // Tooltip Container (Hidden by default)
    const tooltip = d3.select(el)
      .append("div")
      .style("position", "absolute")
      .style("visibility", "hidden")
      .style("background-color", "rgba(17, 24, 39, 0.9)")
      .style("color", "white")
      .style("padding", "8px 12px")
      .style("border-radius", "8px")
      .style("font-size", "12px")
      .style("pointer-events", "none")
      .style("box-shadow", "0 10px 15px -3px rgba(0, 0, 0, 0.1)")
      .style("z-index", "10");

    // Vertical Focus Line
    const focusLine = svg.append("line")
      .attr("stroke", "#6B7280")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3,3")
      .style("opacity", 0)
      .attr("y1", 0)
      .attr("y2", height);

    // Overlay for mouse capture
    svg.append("rect")
      .attr("width", width)
      .attr("height", height)
      .style("fill", "none")
      .style("pointer-events", "all")
      .on("mouseover", () => {
        tooltip.style("visibility", "visible");
        focusLine.style("opacity", 1);
      })
      .on("mouseout", () => {
        tooltip.style("visibility", "hidden");
        focusLine.style("opacity", 0);
      })
      .on("mousemove", (event: any) => {
        const bisect = d3.bisector((d: any) => new Date(d.date)).left;
        const x0 = x.invert(d3.pointer(event)[0]);
        const i = bisect(data, x0, 1);
        const selectedData = data[i - 1]; // Closest data point

        if (!selectedData) return;

        const posX = x(new Date(selectedData.date));
        
        focusLine.attr("x1", posX).attr("x2", posX);

        tooltip
          .html(`
            <div class="font-bold mb-1 border-b border-gray-600 pb-1">${selectedData.date}</div>
            <div class="flex items-center gap-2"><div class="w-2 h-2 rounded-full bg-green-500"></div> Éxitos: <b>${selectedData.success}</b></div>
            <div class="flex items-center gap-2"><div class="w-2 h-2 rounded-full bg-red-500"></div> Errores: <b>${selectedData.error}</b></div>
          `)
          .style("left", `${posX + margin.left + 15}px`) // Offset
          .style("top", `${y(selectedData.success) + margin.top}px`);
      });
  }

  private renderDonutChart() {
    const el = this.donutChartRef.nativeElement;
    d3.select(el).selectAll('*').remove();

    const data = this.stats()!.errorDistribution;
    if (!data.length) {
       d3.select(el).append('div').text('Sin errores registrados').attr('class', 'text-gray-400 text-sm text-center pt-20');
       return;
    }

    const width = el.clientWidth;
    const height = 300;
    const radius = Math.min(width, height) / 2 - 20;

    const svg = d3.select(el)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${width / 2},${height / 2})`);

    const color = d3.scaleOrdinal()
      .domain(data.map((d: any) => d.label))
      .range(['#EF4444', '#F59E0B', '#6366F1', '#EC4899', '#8B5CF6']);

    const pie = d3.pie()
      .value((d: any) => d.count)
      .sort(null)
      .padAngle(0.03); // Space between slices

    const arc = d3.arc()
      .innerRadius(radius * 0.75) // Thinner ring
      .outerRadius(radius)
      .cornerRadius(6); // Rounded edges

    const arcHover = d3.arc()
      .innerRadius(radius * 0.75)
      .outerRadius(radius * 1.05) // Expand on hover
      .cornerRadius(6);

    // Center Text (Total Errors)
    const totalErrors = d3.sum(data, (d: any) => d.count);
    
    const centerGroup = svg.append("g").attr("class", "center-label");
    centerGroup.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "-0.2em")
      .style("font-size", "2rem")
      .style("font-weight", "bold")
      .style("fill", "#6B7280") // Gray 500
      .text(totalErrors);
    
    centerGroup.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "1.2em")
      .style("font-size", "0.8rem")
      .style("fill", "#9CA3AF")
      .style("text-transform", "uppercase")
      .text("Errores");

    // Draw Arcs
    const path = svg.selectAll('path')
      .data(pie(data))
      .enter()
      .append('path')
      .attr('d', arc)
      .attr('fill', (d: any) => color(d.data.label))
      .style('cursor', 'pointer')
      .transition().duration(1000)
      .attrTween("d", function (d: any) {
          const i = d3.interpolate(d.startAngle+0.1, d.endAngle);
          return function (t: any) {
              d.endAngle = i(t);
              return arc(d);
          }
      });

    // Hover Interaction (Re-select to attach events properly after transition)
    svg.selectAll('path')
      .on("mouseover", function(event: any, d: any) {
         d3.select(this)
           .transition().duration(200)
           .attr("d", arcHover);
         
         // Update Center Text temporarily
         centerGroup.select("text:first-child").text(d.data.count).style("fill", color(d.data.label));
         centerGroup.select("text:last-child").text(d.data.label);
      })
      .on("mouseout", function(event: any, d: any) {
         d3.select(this)
           .transition().duration(200)
           .attr("d", arc);
         
         // Reset Center Text
         centerGroup.select("text:first-child").text(totalErrors).style("fill", "#6B7280");
         centerGroup.select("text:last-child").text("Errores");
      });

    // Legend (Below chart)
    const legend = d3.select(el).append('div').attr('class', 'flex flex-wrap justify-center gap-3 mt-4 text-xs');
    
    data.forEach((d: any) => {
       const percentage = Math.round((d.count / totalErrors) * 100);
       legend.append('div')
         .attr('class', 'flex items-center gap-1.5 px-3 py-1 bg-gray-50 dark:bg-gray-700/50 rounded-full border border-gray-100 dark:border-gray-700')
         .html(`
            <span class="w-2.5 h-2.5 rounded-full" style="background-color:${color(d.label)}"></span>
            <span class="text-gray-600 dark:text-gray-300 font-medium">${d.label}</span>
            <span class="text-gray-400 font-bold">${percentage}%</span>
         `);
    });
  }
}
